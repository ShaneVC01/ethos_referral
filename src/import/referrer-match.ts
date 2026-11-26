/**
 * Matches free-text referrer names ("Ahn, Steve OHT") to Referrer Master entries.
 * Exact first and last name gives an exact match. A near match (one letter difference, or a first name
 * that is a prefix of the master first name) gives a probable match. Anything else is left as free text.
 */
import { normaliseName } from '../domain';
import type { ReferrerIndexEntry } from './types';

export type MatchConfidence = 'exact' | 'probable';

export interface ReferrerMatch {
  id: string;
  confidence: MatchConfidence;
  score: number;
}

interface IndexedReferrer {
  id: string;
  first: string;
  last: string;
}

const ROLE_WORDS = /\b(oht|ohts|dds|bds|dr|dentist|ortho|orthodontist|mr|mrs|ms)\b\.?/gi;

/** "Ahn, Steve OHT" to { first: "steve", last: "ahn" }. Returns null when there is no comma (practice names, single words). */
export function parseReferrerText(raw: string): { first: string; last: string } | null {
  const t = raw.replace(ROLE_WORDS, ' ').replace(/\s+/g, ' ').trim();
  const comma = t.indexOf(',');
  if (comma < 0) return null;
  const last = normaliseName(t.slice(0, comma));
  const first = normaliseName(t.slice(comma + 1)).split(' ')[0] ?? '';
  if (!last || !first) return null;
  return { first, last };
}

function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

function lastScore(query: string, candidate: string): number {
  if (query === candidate) return 1;
  if (query.length >= 5 && levenshtein(query, candidate, 1) <= 1) return 0.85;
  return 0;
}

function firstScore(query: string, candidate: string): number {
  if (query === candidate) return 1;
  const shorter = query.length <= candidate.length ? query : candidate;
  const longer = shorter === query ? candidate : query;
  if (shorter.length >= 3 && longer.startsWith(shorter)) return 0.9;
  if (query.length >= 4 && levenshtein(query, candidate, 1) <= 1) return 0.8;
  return 0;
}

export class ReferrerMatcher {
  private readonly entries: IndexedReferrer[];
  private readonly cache = new Map<string, ReferrerMatch | null>();

  constructor(referrers: ReferrerIndexEntry[]) {
    this.entries = referrers.map((r) => ({
      id: r.id,
      first: normaliseName(r.firstName),
      last: normaliseName(r.lastName),
    }));
  }

  /** Best match for a free-text referrer, or null when nothing is close enough or two entries tie. */
  match(raw: string): ReferrerMatch | null {
    const key = raw.trim();
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const parsed = parseReferrerText(key);
    let result: ReferrerMatch | null = null;
    if (parsed) {
      const scored: Array<{ id: string; score: number }> = [];
      for (const e of this.entries) {
        const ls = lastScore(parsed.last, e.last);
        if (ls === 0) continue;
        const fs = firstScore(parsed.first, e.first);
        if (fs === 0) continue;
        scored.push({ id: e.id, score: 0.6 * ls + 0.4 * fs });
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored[0];
      const tied = top !== undefined && scored.length > 1 && Math.abs(scored[1].score - top.score) < 0.001;
      if (top && !tied) {
        if (top.score >= 0.999) result = { id: top.id, confidence: 'exact', score: top.score };
        else if (top.score >= 0.85) result = { id: top.id, confidence: 'probable', score: top.score };
      }
    }
    this.cache.set(key, result);
    return result;
  }
}

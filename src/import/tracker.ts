/**
 * Referral tracker parser ("2026 Dentist referrals.xlsx"). Month tabs in two header layouts, plus the HCF tab.
 *
 * Column mapping is driven by header text, so a column moving does not break the import.
 *  - "Date" columns belong to the contact next to them (before or after, per layout). The first date
 *    with no contact next to it is the referral date.
 *  - Staff and Notes columns belong to the most recent contact column. Notes before the first contact are
 *    referral comments.
 *  - A row whose column B is a date and column C is a name was shifted one column right. Values are read
 *    one column to the right for that row.
 *
 * Step rule (see also domain/cadence.ts):
 *  - Booked, DNC, declined, unsuccessful: cadence finished (currentStep 4). Booked and DNC are closed.
 *  - Blank (contacting) and To call us: currentStep = last logged step + 1, capped at 3 so the final call stays
 *    pending for review. To call us is open and keeps the cadence (Day 14 and 3 month final). Nothing is
 *    auto-closed. No contacts gives step 0 (Coax #1 pending).
 */
import { dedupeKey } from '../domain';
import type { NewReferral, ReferralFlags, ReferralStatus } from '../domain';
import {
  channelFor,
  cellText,
  codeKey,
  dayNoonIso,
  dayStartIso,
  headerKey,
  isAffirmativeOnly,
  isBlankRow,
  parseOutcome,
  parsePhoneCell,
  parseDateCell,
  looksLikeDate,
  parseTrackerStatus,
  rowHash,
  splitPatientName,
  type SplitName,
} from './normalise';
import { ReferrerMatcher } from './referrer-match';
import type {
  CellValue,
  ContactStep,
  ImportContactDraft,
  LookupContext,
  ParsedRow,
  SheetInput,
  SheetReport,
  TrackerParseResult,
  UnmatchedCode,
} from './types';

const MONTH_TABS = ['JAN', 'FEB', 'MAR', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
const CLOSED_BY_STATUS: Partial<Record<ReferralStatus, 'booked' | 'do_not_contact'>> = {
  booked: 'booked',
  do_not_contact: 'do_not_contact',
};
const NOISE_COMMENT = /copied into/i;

type Role = 'date' | 'name' | 'age' | 'phone' | 'notes' | 'clinic' | 'ortho' | 'referrer' | 'staff' | 'status' | 'returned' | 'contact' | 'other';

interface ColPlan {
  index: number;
  role: Role;
  /** Contact columns only: cadence step and whether the column is a Coax (SMS) column. */
  step?: ContactStep;
  coax?: boolean;
  /** Date, staff and notes columns: index of the contact column they belong to, or null for referral level. */
  group: number | null;
}

/** Maps a normalised header to a role. Order matters: more specific headers first. */
function roleOf(key: string): { role: Role; step?: ContactStep; coax?: boolean } {
  if (!key) return { role: 'other' };
  const compact = key.replace(/[\s.]/g, '');
  if (key.startsWith('pt name')) return { role: 'name' };
  if (key.replace(/\s/g, '') === 'a/y/c') return { role: 'age' };
  if (key === 'contact number') return { role: 'phone' };
  if (key === 'notes') return { role: 'notes' };
  if (key === 'location') return { role: 'clinic' };
  if (key === 'ortho') return { role: 'ortho' };
  if (key === 'referrer') return { role: 'referrer' };
  if (key === 'date' || key === 'ref. date' || key === 'ref date') return { role: 'date' };
  if (key === 'staff') return { role: 'staff' };
  if (key === 'status') return { role: 'status' };
  if (compact === 'refreturned') return { role: 'returned' };
  if (key.startsWith('1st contact')) return { role: 'contact', step: 0, coax: false };
  if (key.startsWith('coax sent')) return { role: 'contact', step: 0, coax: true };
  if (key.startsWith('2nd contact') || key.startsWith('1st call')) return { role: 'contact', step: 1, coax: false };
  if (key.startsWith('2nd call')) return { role: 'contact', step: 2, coax: false };
  if (key.startsWith('3rd call') || key.startsWith('final sms')) return { role: 'contact', step: 3, coax: key.startsWith('final sms') };
  return { role: 'other' };
}

export function buildPlan(header: CellValue[]): ColPlan[] {
  const plan: ColPlan[] = [];
  let seenStatus = false;
  header.forEach((h, index) => {
    const r = roleOf(headerKey(h));
    let role = r.role;
    if (role === 'status') {
      if (seenStatus) role = 'other'; // Feb has a second, empty "Status" header at the end
      seenStatus = true;
    }
    plan.push({ index, role, step: r.step, coax: r.coax, group: null });
  });
  let current: number | null = null;
  for (let i = 0; i < plan.length; i++) {
    const c = plan[i];
    if (c.role === 'contact') {
      current = i;
    } else if (c.role === 'status' || c.role === 'returned' || c.role === 'name') {
      current = null;
    } else if (c.role === 'date') {
      const next = plan[i + 1];
      const prev = plan[i - 1];
      if (next?.role === 'contact') c.group = next.index;
      else if (prev?.role === 'contact') c.group = prev.index;
      else c.group = current;
    } else if (c.role === 'staff' || c.role === 'notes') {
      c.group = current;
    }
  }
  return plan;
}

/** Lookup tables, built once per parse run. */
export interface Maps {
  clinics: Map<string, string>;
  orthos: Map<string, string>;
  unconfirmedOrthoKeys: Set<string>;
  staff: Map<string, string>;
  matcher: ReferrerMatcher;
}

export function buildMaps(ctx: LookupContext): Maps {
  const clinics = new Map<string, string>();
  for (const c of ctx.clinics) clinics.set(codeKey(c.code), c.id);
  for (const a of ctx.clinicAliases) if (!clinics.has(codeKey(a.alias))) clinics.set(codeKey(a.alias), a.clinicId);

  const orthos = new Map<string, string>();
  const unconfirmedOrthoKeys = new Set<string>();
  const addOrtho = (raw: string, id: string, confirmed: boolean) => {
    const key = codeKey(raw);
    for (const k of [key, key.replace(/\s/g, '')]) {
      if (!orthos.has(k)) orthos.set(k, id);
      if (!confirmed) unconfirmedOrthoKeys.add(k);
    }
  };
  for (const o of ctx.orthodontists) addOrtho(o.shortCode, o.id, true);
  for (const a of ctx.orthoAliases) addOrtho(a.alias, a.orthodontistId, a.confirmed);

  const staff = new Map<string, string>();
  for (const s of ctx.staff) staff.set(s.initials.replace(/[^A-Za-z]/g, '').toUpperCase(), s.id);

  return { clinics, orthos, unconfirmedOrthoKeys, staff, matcher: new ReferrerMatcher(ctx.referrers) };
}

interface SourceRow {
  sheet: string;
  order: number;
  rowNumber: number;
  rowHash: string;
  name: SplitName | null;
  /** Patient key without the dedupe grouping. Null for rows with no name. */
  key: string | null;
  phone: string | null;
  candidate: NewReferral | null;
  status: ReferralStatus | null;
  rawStatus: string | null;
  receivedOn: string | null;
  contacts: ImportContactDraft[];
  messages: string[];
  unmatched: UnmatchedCode[];
  unconfirmedOrthoUses: number;
}

const FLAG_RULES: Array<[keyof ReferralFlags, RegExp]> = [
  ['urgent', /\burgent\b|\basap\b/i],
  ['existingPatient', /in system|in treatment|existing|already a patient/i],
  ['sibling', /\b(sister|sis|brother|bro|sibling|twin)s?\b/i],
  ['languageSupport', /interpreter|language|translat/i],
  ['femaleOrthoRequested', /female ortho|female doctor|female dr/i],
];

function buildSourceRow(
  sheet: SheetInput,
  order: number,
  plan: ColPlan[],
  raw: CellValue[],
  index: number,
  hcf: boolean,
  maps: Maps,
  fallbackMonth: string | null,
): SourceRow {
  const rowNumber = index + 1;
  const hash = rowHash(sheet.name, raw);
  const base = { sheet: sheet.name, order, rowNumber, rowHash: hash, phone: null, status: null, rawStatus: null, receivedOn: null, contacts: [] as ImportContactDraft[] };
  const messages: string[] = [];
  const unmatched: UnmatchedCode[] = [];
  let unconfirmedOrthoUses = 0;
  const note = (kind: UnmatchedCode['kind'], value: string) => unmatched.push({ kind, value, sheet: sheet.name, rowNumber });

  // Shifted row: the referral date landed in column B and the name in column C.
  const shift = looksLikeDate(raw[1]) && !looksLikeDate(raw[0]) && cellText(raw[2]) !== '' ? 1 : 0;
  if (shift) messages.push('Row was one column to the right in the source. Values were realigned.');
  const cell = (i: number): CellValue => raw[i + shift];

  const byRole = (role: Role): ColPlan | undefined => plan.find((c) => c.role === role);
  const groupCells = (role: Role, group: number | null): CellValue[] =>
    plan.filter((c) => c.role === role && c.group === group).map((c) => cell(c.index));
  const text = (role: Role): string => {
    const col = byRole(role);
    return col ? cellText(cell(col.index)) : '';
  };

  const nameCol = byRole('name');
  const name = nameCol ? splitPatientName(cellText(cell(nameCol.index))) : null;
  if (name && !name.hadComma && name.last) messages.push('Name has no comma. The whole text was read as the surname.');

  // Referral date: the first date column not attached to a contact.
  const referralDateCell = plan.find((c) => c.role === 'date' && c.group === null);
  let receivedOn = referralDateCell ? parseDateCell(cell(referralDateCell.index)) : null;

  // Contacts.
  const contacts: ImportContactDraft[] = [];
  const extraComments: string[] = [];
  for (const col of plan) {
    if (col.role !== 'contact' || col.step === undefined) continue;
    const rawOutcome = cell(col.index);
    const outcomeText = cellText(rawOutcome);
    let date = groupCells('date', col.index).map(parseDateCell).find((d) => d !== null) ?? null;
    if (!date && outcomeText && looksLikeDate(rawOutcome)) date = parseDateCell(rawOutcome); // date typed in the outcome column
    const notes = groupCells('notes', col.index).map(cellText).filter(Boolean).join('; ') || null;
    const staffRaw = groupCells('staff', col.index).map(cellText).find(Boolean) ?? '';
    if (!outcomeText && !date && !notes && !staffRaw) continue;
    if (!outcomeText && !date) continue;

    // "No just call" in a Coax column: no coax was sent. The call is recorded in its own column.
    if (col.coax && /^no\b/i.test(outcomeText)) {
      extraComments.push(`Coax not sent (${outcomeText})`);
      continue;
    }

    let outcome = parseOutcome(rawOutcome);
    let freeText: string | null = null;
    if (!outcome) {
      if (!looksLikeDate(rawOutcome) && !isAffirmativeOnly(rawOutcome)) {
        // Free text in an outcome column: keep the words on the contact, report the value for review.
        note('outcome', outcomeText);
        freeText = outcomeText;
        messages.push(`Outcome "${outcomeText}" is not a known outcome. Kept in the contact notes.`);
      }
      outcome = col.coax ? 'coax_sent' : 'lm_coax_sent';
    }

    // Staff: a short run of letters is initials. Longer text is a note, not a staff member.
    let staffId: string | null = null;
    let staffNote: string | null = null;
    const staffText = staffRaw.trim();
    if (/^[A-Za-z]{1,3}$/.test(staffText)) {
      const initials = staffText.toUpperCase();
      staffId = maps.staff.get(initials) ?? null;
      if (!staffId) note('staff', initials);
    } else if (/[A-Za-z]/.test(staffText)) {
      staffNote = `Staff note: ${staffText}`;
    }
    const notesAll = [freeText, notes, staffNote].filter((x): x is string => !!x).join('; ') || null;

    const at = date ?? receivedOn;
    if (!date) messages.push(`${sheet.name} row ${rowNumber}: contact date missing. Used the referral date.`);
    contacts.push({
      step: col.step,
      channel: channelFor(outcome, !!col.coax),
      outcome,
      at: dayNoonIso(at ?? fallbackMonth ?? '2026-01-01'),
      staffId,
      notes: notesAll,
    });
  }
  if (!receivedOn) {
    const earliest = contacts.map((c) => c.at.slice(0, 10)).sort()[0];
    if (earliest) receivedOn = earliest;
    else if (fallbackMonth) {
      receivedOn = fallbackMonth;
      messages.push('No referral date. Used the first day of the tab.');
    }
  }

  // Status.
  const statusText = text('status');
  const statusParse = parseTrackerStatus(statusText);
  if (statusParse.warning) messages.push(statusParse.warning);
  const rawStatus = statusText && /[a-z]/i.test(statusText) ? statusText : null;

  if (!name || !name.last) {
    messages.push('No patient name. This row was not imported.');
    return { ...base, name: null, key: null, messages, unmatched, unconfirmedOrthoUses, receivedOn, status: statusParse.status, rawStatus, candidate: null };
  }

  // Contact cell: phone, email, tag.
  const phoneCol = byRole('phone');
  const phoneParse = parsePhoneCell(phoneCol ? cell(phoneCol.index) : '');

  // Clinic and orthodontist.
  const clinicRaw = text('clinic');
  let preferredClinicId: string | null = null;
  let preferredClinicIsNearest = false;
  if (/^nearest to pt$/i.test(clinicRaw)) preferredClinicIsNearest = true;
  else if (clinicRaw) {
    preferredClinicId = maps.clinics.get(codeKey(clinicRaw)) ?? null;
    if (!preferredClinicId) {
      note('clinic', clinicRaw);
      messages.push(`Clinic code "${clinicRaw}" is not in the clinic list. Left blank.`);
    }
  }
  const orthoRaw = text('ortho');
  let preferredOrthodontistId: string | null = null;
  let preferredOrthodontistIsNextAvailable = false;
  if (/^next available$/i.test(orthoRaw)) preferredOrthodontistIsNextAvailable = true;
  else if (orthoRaw) {
    const key = codeKey(orthoRaw);
    preferredOrthodontistId = maps.orthos.get(key) ?? maps.orthos.get(key.replace(/\s/g, '')) ?? null;
    if (!preferredOrthodontistId) {
      note('ortho', orthoRaw);
      messages.push(`Orthodontist code "${orthoRaw}" is not in the orthodontist list. Left blank.`);
    } else if (maps.unconfirmedOrthoKeys.has(key) || maps.unconfirmedOrthoKeys.has(key.replace(/\s/g, ''))) {
      unconfirmedOrthoUses++;
    }
  }

  // Referrer.
  const referrerRaw = text('referrer');
  let referrerId: string | null = null;
  let referrerText: NewReferral['referrerText'] = null;
  if (referrerRaw) {
    const match = maps.matcher.match(referrerRaw);
    if (match) referrerId = match.id;
    else {
      referrerText = { name: referrerRaw, address: null, phone: null, email: null };
      note('referrer', referrerRaw);
    }
  }

  // Age group.
  const ageRaw = text('age').toUpperCase();
  let ageGroup: NewReferral['ageGroup'] = null;
  if (/^[AYC]$/.test(ageRaw)) ageGroup = ageRaw as 'A' | 'Y' | 'C';
  else if (ageRaw) messages.push(`Age group "${ageRaw}" is not A, Y or C. Left blank.`);

  // Comments: general notes, phone tags and extra numbers, returned date, text statuses.
  const commentParts: string[] = [];
  for (const col of plan) if (col.role === 'notes' && col.group === null) commentParts.push(cellText(cell(col.index)));
  commentParts.push(...phoneParse.notes, ...extraComments);
  if (phoneParse.email && !phoneCol) commentParts.push(phoneParse.email);
  const returnedCol = byRole('returned');
  if (returnedCol) {
    const r = cell(returnedCol.index);
    const d = parseDateCell(r);
    if (d) commentParts.push(`Referral returned on ${d}`);
    else if (cellText(r) && !isAffirmativeOnly(r)) commentParts.push(`Referral returned: ${cellText(r)}`);
  }
  if (statusParse.status === null && rawStatus) commentParts.push(`Tracker status: ${rawStatus}`);
  const comments = commentParts.map((p) => p.trim()).filter(Boolean).join('; ') || null;

  const allText = `${comments ?? ''} ${contacts.map((c) => c.notes ?? '').join(' ')}`;
  const flags: ReferralFlags = {
    urgent: false,
    existingPatient: false,
    sibling: false,
    hcf,
    languageSupport: false,
    femaleOrthoRequested: false,
  };
  for (const [flag, re] of FLAG_RULES) if (re.test(allText)) flags[flag] = true;

  const phone = phoneParse.phone;
  const candidate: NewReferral = {
    receivedAt: dayStartIso(receivedOn ?? fallbackMonth ?? '2026-01-01'),
    source: 'other',
    submissionType: 'referring_patient',
    patientFirstName: name.first,
    patientLastName: name.last,
    dob: null,
    ageGroup,
    phone,
    contactPerson: phoneParse.contactPerson,
    email: phoneParse.email,
    address: null,
    preferredClinicId,
    preferredClinicIsNearest,
    preferredOrthodontistId,
    preferredOrthodontistIsNextAvailable,
    referrerId,
    referrerText,
    comments,
    flags,
    assignedTo: null,
  };

  return {
    ...base,
    name,
    key: dedupeKey({ firstName: name.first, lastName: name.last, phone }),
    phone,
    candidate,
    status: statusParse.status,
    rawStatus,
    receivedOn,
    contacts,
    messages,
    unmatched,
    unconfirmedOrthoUses,
  };
}

/* ---------- merge ---------- */

function unionContacts(list: ImportContactDraft[]): ImportContactDraft[] {
  const seen = new Set<string>();
  const out: ImportContactDraft[] = [];
  for (const c of list) {
    const k = `${c.step}|${c.outcome}|${c.at}|${c.staffId ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out.sort((a, b) => (a.at === b.at ? a.step - b.step : a.at < b.at ? -1 : 1));
}

interface MergedGroup {
  candidate: NewReferral;
  status: ReferralStatus;
  currentStep: number;
  contacts: ImportContactDraft[];
  closedAt: string | null;
  /** Earliest copy: owns the referral. */
  base: SourceRow;
}

function mergeGroup(group: SourceRow[]): MergedGroup {
  // Earliest receipt first, then sheet order.
  const byReceipt = [...group].sort((a, b) => {
    const ra = a.receivedOn ?? '9999-12-31';
    const rb = b.receivedOn ?? '9999-12-31';
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.order - b.order || a.rowNumber - b.rowNumber;
  });
  const base = byReceipt[0];
  const first = base.candidate as NewReferral;
  const merged: NewReferral = { ...first, flags: { ...first.flags } };
  const fillable = ['phone', 'contactPerson', 'email', 'address', 'preferredClinicId', 'preferredOrthodontistId', 'referrerId', 'referrerText', 'ageGroup', 'dob'] as const;
  const fields = merged as unknown as Record<string, unknown>;
  for (const other of byReceipt) {
    const c = other.candidate as NewReferral;
    for (const k of fillable) if (fields[k] === null || fields[k] === undefined) fields[k] = c[k];
    merged.preferredClinicIsNearest = merged.preferredClinicIsNearest || c.preferredClinicIsNearest;
    merged.preferredOrthodontistIsNextAvailable = merged.preferredOrthodontistIsNextAvailable || c.preferredOrthodontistIsNextAvailable;
    for (const f of Object.keys(merged.flags) as Array<keyof ReferralFlags>) merged.flags[f] = merged.flags[f] || c.flags[f];
  }
  const fragments = new Set<string>();
  for (const other of byReceipt) {
    for (const frag of (other.candidate?.comments ?? '').split('; ')) {
      if (frag && !NOISE_COMMENT.test(frag)) fragments.add(frag);
    }
  }
  merged.comments = fragments.size ? [...fragments].join('; ') : null;

  // Latest non-blank status wins: later month tabs are newer copies. Blank copies never overwrite.
  const latest = group
    .filter((r) => r.status !== null)
    .sort((a, b) => a.order - b.order || a.rowNumber - b.rowNumber)
    .pop();
  const status: ReferralStatus = latest?.status ?? 'contacting';
  merged.status = status;

  const contacts = unionContacts(group.flatMap((r) => r.contacts));
  let currentStep: number;
  if (status !== 'contacting' && status !== 'to_call_us') {
    currentStep = 4; // booked, do not contact, declined, unsuccessful: the cadence is finished
  } else {
    const maxStep = contacts.reduce((m, c) => Math.max(m, c.step), -1);
    currentStep = contacts.length === 0 ? 0 : Math.min(maxStep + 1, 3); // final call stays pending for review
  }
  const lastAt = contacts.length ? contacts[contacts.length - 1].at : merged.receivedAt;
  const closedAt = CLOSED_BY_STATUS[status] ? lastAt : null;
  return { candidate: merged, status, currentStep, contacts, closedAt, base };
}

/** Patient key for each source row. Phone-less rows join the only phone-keyed patient with the same name. */
function assignKeys(rows: SourceRow[]): Map<SourceRow, string> {
  const phoneKeysByName = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.name || !r.key || !r.phone) continue;
    const nameOnly = `${r.name.last}|${r.name.first}`;
    const set = phoneKeysByName.get(nameOnly) ?? new Set<string>();
    set.add(r.key);
    phoneKeysByName.set(nameOnly, set);
  }
  const keys = new Map<SourceRow, string>();
  for (const r of rows) {
    if (!r.name || !r.key || !r.candidate) continue;
    let key = r.key;
    if (!r.phone) {
      const set = phoneKeysByName.get(`${r.name.last}|${r.name.first}`);
      if (set && set.size === 1) key = [...set][0];
    }
    keys.set(r, key);
  }
  return keys;
}

export function parseTracker(sheets: SheetInput[], ctx: LookupContext): TrackerParseResult {
  const maps = buildMaps(ctx);
  const ordered = sheets
    .map((s) => {
      const upper = s.name.trim().toUpperCase();
      const month = MONTH_TABS.indexOf(upper);
      if (month >= 0) return { sheet: s, order: month + 1, kind: 'month' as const };
      if (upper.startsWith('HCF')) return { sheet: s, order: 13, kind: 'hcf' as const };
      return { sheet: s, order: 99, kind: 'skip' as const };
    })
    .filter((s) => s.kind !== 'skip')
    .sort((a, b) => a.order - b.order);

  const reports: SheetReport[] = [];
  const rows: SourceRow[] = [];
  const unmatched: UnmatchedCode[] = [];
  let unconfirmedOrthoUses = 0;

  for (const s of ordered) {
    const header = s.sheet.rows[0] ?? [];
    const plan = buildPlan(header);
    const layout: SheetReport['layout'] =
      s.kind === 'hcf' ? 'hcf' : header.some((h) => headerKey(h).startsWith('coax sent')) ? 'jun_dec' : 'jan_may';
    const fallbackMonth = s.kind === 'month' ? `2026-${String(s.order).padStart(2, '0')}-01` : null;
    let dataRows = 0;
    let errorRows = 0;
    for (let i = 1; i < s.sheet.rows.length; i++) {
      const raw = s.sheet.rows[i];
      if (isBlankRow(raw)) continue;
      dataRows++;
      const row = buildSourceRow(s.sheet, s.order, plan, raw, i, s.kind === 'hcf', maps, fallbackMonth);
      if (!row.candidate) errorRows++;
      rows.push(row);
      unmatched.push(...row.unmatched);
      unconfirmedOrthoUses += row.unconfirmedOrthoUses;
    }
    reports.push({ name: s.sheet.name, layout, dataRows, errorRows });
  }

  const keys = assignKeys(rows);
  const groups = new Map<string, SourceRow[]>();
  for (const r of rows) {
    const key = keys.get(r);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const merged = new Map<string, MergedGroup>();
  for (const [key, list] of groups) merged.set(key, mergeGroup(list));

  const out: ParsedRow[] = rows.map((r) => {
    const key = keys.get(r);
    const m = key ? merged.get(key) : undefined;
    if (!key || !m) {
      return {
        sheet: r.sheet,
        rowNumber: r.rowNumber,
        rowHash: r.rowHash,
        dedupeKey: '',
        candidate: null,
        currentStep: 0,
        contacts: [],
        rawStatus: r.rawStatus,
        copies: 1,
        isBase: false,
        mergedFrom: [],
        closedAt: null,
        level: 'error' as const,
        messages: r.messages,
        unmatched: r.unmatched,
      };
    }
    const messages = [...r.messages];
    if (r.status !== null && r.status !== m.status) {
      messages.push(`Status "${r.rawStatus ?? ''}" differs from the merged status. The latest non-blank status was kept.`);
    }
    const group = groups.get(key) ?? [];
    return {
      sheet: r.sheet,
      rowNumber: r.rowNumber,
      rowHash: r.rowHash,
      dedupeKey: key,
      candidate: m.candidate,
      currentStep: m.currentStep,
      contacts: m.contacts,
      rawStatus: r.rawStatus,
      copies: group.length,
      isBase: m.base === r,
      mergedFrom: group.map((g) => `${g.sheet} row ${g.rowNumber}`),
      closedAt: m.closedAt,
      level: messages.length ? 'warning' : 'ok',
      messages,
      unmatched: r.unmatched,
    };
  });

  return {
    sheets: reports,
    rows: out,
    patients: merged.size,
    mergedCopies: out.filter((p) => p.candidate && !p.isBase).length,
    unmatched,
    unconfirmedOrthoUses,
  };
}

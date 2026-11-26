/**
 * Referrer Master import ("Ethos_Referrer_Master_20261113"). Reads three tabs:
 *  - Referrer Master: one row per professional, keyed on Referrer ID (R####).
 *  - Practices: keyed on name and postcode.
 *  - Referral Detail: Edge referral history. Patient names are dropped; only Edge patient references are kept.
 * Other Sources and Patient Referrers are not held in the data model yet and are counted, not imported.
 */
import { digitsOnly } from '../domain';
import type { Practice, Referrer, ReferrerHistory } from '../domain';
import { buildMaps } from './tracker';
import { cellText, codeKey, hashString, headerKey, isBlankRow, parseDateCell, parsePhoneCell } from './normalise';
import type { CellValue, LookupContext, SheetInput, UnmatchedCode } from './types';

export interface ReferrerMasterResult {
  referrers: Referrer[];
  practices: Practice[];
  history: ReferrerHistory[];
  /** Rows skipped because the Referrer ID was missing or malformed. */
  skippedReferrers: number;
  /** History rows with no Referrer ID (practice or unknown professional). Not imported. */
  historyWithoutReferrer: number;
  unmatched: UnmatchedCode[];
  /** Tabs read, with row counts. */
  tabs: Array<{ name: string; rows: number }>;
}

function col(header: CellValue[], name: string): number {
  const target = name.toLowerCase();
  return header.findIndex((h) => headerKey(h) === target || headerKey(h).startsWith(target));
}

function get(row: CellValue[], i: number): CellValue {
  return i < 0 ? undefined : row[i];
}

function sheetByName(sheets: SheetInput[], name: string): SheetInput | undefined {
  return sheets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
}

function textOrNull(v: CellValue): string | null {
  const t = cellText(v);
  return t && t.toLowerCase() !== 'none' ? t : null;
}

function intOf(v: CellValue): number {
  const n = Number(cellText(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function parseReferrerMaster(sheets: SheetInput[], ctx: LookupContext): ReferrerMasterResult {
  const maps = buildMaps(ctx);
  const unmatched: UnmatchedCode[] = [];
  const tabs: ReferrerMasterResult['tabs'] = [];

  // Practices first, so referrers can point at them.
  const practices: Practice[] = [];
  const practiceByKey = new Map<string, string>();
  const practiceSheet = sheetByName(sheets, 'Practices');
  if (practiceSheet) {
    const h = practiceSheet.rows[0] ?? [];
    const iName = col(h, 'practice');
    const iSuburb = col(h, 'suburb');
    const iState = col(h, 'state');
    const iPost = col(h, 'postcode');
    const iPhone = col(h, 'phone');
    const iEmail = col(h, 'email');
    let n = 0;
    for (const row of practiceSheet.rows.slice(1)) {
      if (isBlankRow(row)) continue;
      const name = cellText(get(row, iName));
      if (!name) continue;
      n++;
      const postcode = textOrNull(get(row, iPost));
      const id = `prac_${hashString(`${name.toLowerCase()}|${postcode ?? ''}`)}`;
      if (practiceByKey.has(`${name.toLowerCase()}|${postcode ?? ''}`)) continue;
      practiceByKey.set(`${name.toLowerCase()}|${postcode ?? ''}`, id);
      practices.push({
        id,
        name,
        address: null,
        suburb: textOrNull(get(row, iSuburb)),
        state: textOrNull(get(row, iState)),
        postcode,
        phone: parsePhoneCell(get(row, iPhone)).phone,
        email: textOrNull(get(row, iEmail)),
      });
    }
    tabs.push({ name: practiceSheet.name, rows: n });
  }

  // Referrers.
  const referrers: Referrer[] = [];
  const referrerIds = new Set<string>();
  let skippedReferrers = 0;
  const master = sheetByName(sheets, 'Referrer Master');
  if (master) {
    const h = master.rows[0] ?? [];
    const iId = col(h, 'referrer id');
    const iSeg = col(h, 'segment');
    const iType = col(h, 'professional type');
    const iPractice = col(h, 'current practice');
    const iFirst = col(h, 'first name');
    const iLast = col(h, 'last name');
    const iAddr1 = col(h, 'address 1');
    const iAddr2 = col(h, 'address 2');
    const iSuburb = col(h, 'suburb');
    const iState = col(h, 'state');
    const iPost = col(h, 'postcode');
    const iPhone = col(h, 'phone');
    const iEmail = col(h, 'email');
    const iStatus = col(h, 'edge record status');
    const iFy27 = col(h, 'fy27 ytd');
    const iTotal = col(h, 'referrals (all recorded)');
    const iStarted = col(h, 'started');
    const iLastRef = col(h, 'last referral');
    const iClinic = col(h, 'primary ethos clinic');
    const iOrtho = col(h, 'primary orthodontist');
    let n = 0;
    for (const row of master.rows.slice(1)) {
      if (isBlankRow(row)) continue;
      n++;
      const id = cellText(get(row, iId));
      if (!/^R\d+$/.test(id) || referrerIds.has(id)) {
        skippedReferrers++;
        continue;
      }
      referrerIds.add(id);
      const practiceName = cellText(get(row, iPractice));
      const postcode = textOrNull(get(row, iPost));
      const practiceId = practiceByKey.get(`${practiceName.toLowerCase()}|${postcode ?? ''}`) ?? null;
      const clinicCode = cellText(get(row, iClinic));
      let primaryClinicId: string | null = null;
      if (clinicCode) {
        primaryClinicId = maps.clinics.get(codeKey(clinicCode)) ?? null;
        if (!primaryClinicId) unmatched.push({ kind: 'clinic', value: clinicCode, sheet: master.name, rowNumber: n + 1 });
      }
      const orthoCode = cellText(get(row, iOrtho));
      let primaryOrthodontistId: string | null = null;
      if (orthoCode) {
        primaryOrthodontistId = maps.orthos.get(codeKey(orthoCode)) ?? null;
        if (!primaryOrthodontistId) unmatched.push({ kind: 'ortho', value: orthoCode, sheet: master.name, rowNumber: n + 1 });
      }
      const first = cellText(get(row, iFirst));
      const last = cellText(get(row, iLast));
      const addressParts = [textOrNull(get(row, iAddr1)), textOrNull(get(row, iAddr2)), textOrNull(get(row, iSuburb)), textOrNull(get(row, iState)), postcode]
        .filter((p): p is string => !!p);
      referrers.push({
        id,
        segment: cellText(get(row, iSeg)) || 'Unassigned',
        type: cellText(get(row, iType)) || 'Unknown',
        practiceId,
        title: null,
        firstName: first,
        lastName: last,
        phone: parsePhoneCell(get(row, iPhone)).phone,
        email: textOrNull(get(row, iEmail)),
        address: addressParts.length ? addressParts.join(', ') : null,
        primaryClinicId,
        primaryOrthodontistId,
        fyReferrals: intOf(get(row, iFy27)),
        totalReferrals: intOf(get(row, iTotal)),
        totalStarted: intOf(get(row, iStarted)),
        lastReferralAt: parseDateCell(get(row, iLastRef)),
        active: !/inactive|resigned|closed/i.test(cellText(get(row, iStatus))),
      });
    }
    tabs.push({ name: master.name, rows: n });
  }

  // Edge referral history. Names are not kept.
  const history: ReferrerHistory[] = [];
  let historyWithoutReferrer = 0;
  const detail = sheetByName(sheets, 'Referral Detail');
  if (detail) {
    const h = detail.rows[0] ?? [];
    const iPatientId = col(h, 'patient id');
    const iDate = col(h, 'referral date');
    const iStarted = col(h, 'started');
    const iStatus = col(h, 'patient status');
    const iRefId = col(h, 'referrer id');
    const iClinic = col(h, 'ethos clinic');
    const iOrtho = col(h, 'orthodontist');
    let n = 0;
    detail.rows.slice(1).forEach((row, idx) => {
      if (isBlankRow(row)) return;
      n++;
      const referrerId = cellText(get(row, iRefId));
      if (!/^R\d+$/.test(referrerId)) {
        historyWithoutReferrer++;
        return;
      }
      const receivedOn = parseDateCell(get(row, iDate));
      if (!receivedOn) return;
      const clinicCode = cellText(get(row, iClinic));
      const orthoCode = cellText(get(row, iOrtho));
      const orthoId = orthoCode ? maps.orthos.get(codeKey(orthoCode)) ?? null : null;
      if (orthoCode && !orthoId) unmatched.push({ kind: 'ortho', value: orthoCode, sheet: detail.name, rowNumber: idx + 2 });
      history.push({
        id: `rh_${hashString(`${idx}|${referrerId}`)}`,
        referrerId,
        receivedOn,
        edgePatientRef: textOrNull(get(row, iPatientId)),
        clinicId: clinicCode ? maps.clinics.get(codeKey(clinicCode)) ?? null : null,
        orthodontistId: orthoId,
        booked: cellText(get(row, iStarted)).toUpperCase() === 'Y',
        notes: textOrNull(get(row, iStatus)),
      });
    });
    tabs.push({ name: detail.name, rows: n });
  }

  // Digits are checked here so a bad phone never reaches the seed as text.
  for (const r of referrers) if (r.phone && !digitsOnly(r.phone)) r.phone = null;

  return { referrers, practices, history, skippedReferrers, historyWithoutReferrer, unmatched, tabs };
}

/**
 * Hand-authored lookup seed: clinics, aliases, orthodontists, roster and staff.
 * Source: "Master List of Orthodontists and Clinics.xlsx" and the codes table in the plan.
 *
 * confirmed: false = a guess from the plan's codes table, not yet checked against the clinic.
 * The importer flags unconfirmed aliases for review. Clear the flag here once confirmed.
 */
import type { Clinic, ClinicAlias, Orthodontist, OrthoAlias, RosterEntry, Staff } from '@/domain';
import type { Lookups } from '@/data/repository';

export const CLINICS: Clinic[] = [
  { id: 'clin_umg', code: 'UMG', name: 'Upper Mount Gravatt', openedOn: null, active: true },
  { id: 'clin_bp', code: 'BP', name: 'Browns Plains', openedOn: null, active: true },
  { id: 'clin_clay', code: 'CLAY', name: 'Clayfield', openedOn: null, active: true },
  { id: 'clin_log', code: 'LOG', name: 'Loganholme', openedOn: null, active: true },
  { id: 'clin_nl', code: 'NL', name: 'North Lakes', openedOn: null, active: true },
  { id: 'clin_red', code: 'RED', name: 'Redcliffe', openedOn: null, active: true },
  { id: 'clin_twg', code: 'TWG', name: 'Toowong', openedOn: null, active: true },
  { id: 'clin_cle', code: 'CLE', name: 'Cleveland', openedOn: null, active: true },
  { id: 'clin_car', code: 'CAR', name: 'Carindale', openedOn: null, active: true },
  { id: 'clin_coo', code: 'COO', name: 'Upper Coomera', openedOn: '2024-02-01', active: true },
  { id: 'clin_fh', code: 'FH', name: 'Ferny Hills', openedOn: '2024-07-01', active: true },
  { id: 'clin_tsv', code: 'TSV', name: 'Townsville', openedOn: '2024-11-26', active: true },
  { id: 'clin_noo', code: 'NOO', name: 'Noosa', openedOn: '2025-01-01', active: true },
];

/** Aliases normalise import data. Matching is case insensitive. */
export const CLINIC_ALIASES: ClinicAlias[] = [
  { alias: 'TOOW', clinicId: 'clin_twg' },
  { alias: 'TWG', clinicId: 'clin_twg' },
  { alias: 'CLEVE', clinicId: 'clin_cle' },
  { alias: 'CARIN', clinicId: 'clin_car' },
  { alias: 'COOMERA', clinicId: 'clin_coo' },
  { alias: 'NOOSA', clinicId: 'clin_noo' },
  { alias: 'CLE', clinicId: 'clin_cle' },
  { alias: 'CAR', clinicId: 'clin_car' },
  { alias: 'COO', clinicId: 'clin_coo' },
  { alias: 'NOO', clinicId: 'clin_noo' },
  { alias: 'UMG', clinicId: 'clin_umg' },
  { alias: 'BP', clinicId: 'clin_bp' },
  { alias: 'CLAY', clinicId: 'clin_clay' },
  { alias: 'LOG', clinicId: 'clin_log' },
  { alias: 'NL', clinicId: 'clin_nl' },
  { alias: 'RED', clinicId: 'clin_red' },
  { alias: 'FH', clinicId: 'clin_fh' },
  { alias: 'TSV', clinicId: 'clin_tsv' },
  { alias: 'Toowong', clinicId: 'clin_twg' },
  { alias: 'Cleveland', clinicId: 'clin_cle' },
  { alias: 'Carindale', clinicId: 'clin_car' },
];

/**
 * Orthodontists. shortCode is the roster short name where no tracker code is known.
 * Start dates from the Master List. Future start dates are kept active so they appear on the roster.
 */
export const ORTHODONTISTS: Orthodontist[] = [
  { id: 'ort_ac', shortCode: 'AC', fullName: 'Anna Chang', startDate: null, active: true, notes: null },
  { id: 'ort_mat', shortCode: 'MAT', fullName: 'Marcus Tod', startDate: null, active: true, notes: null },
  { id: 'ort_zs', shortCode: 'ZS', fullName: 'Zak Sullivan', startDate: '2026-03-02', active: true, notes: 'Noosa' },
  { id: 'ort_jd', shortCode: 'JD', fullName: 'Julia Dando', startDate: '2024-11-25', active: true, notes: 'Townsville' },
  { id: 'ort_or', shortCode: 'OR', fullName: 'Oscar Renison', startDate: '2023-07-15', active: true, notes: null },
  { id: 'ort_sp', shortCode: 'SP', fullName: 'Shari Prove', startDate: null, active: true, notes: null },
  { id: 'ort_tl', shortCode: 'TL', fullName: 'Ting Lin', startDate: '2024-02-12', active: true, notes: null },
  { id: 'ort_ksf', shortCode: 'KSF', fullName: 'Kent Farmer', startDate: null, active: true, notes: null },
  { id: 'ort_nm', shortCode: 'NM', fullName: 'Nadine McGiffin', startDate: '2025-02-03', active: true, notes: null },
  { id: 'ort_cos', shortCode: "CO'S", fullName: "Cath O'Shea", startDate: null, active: true, notes: null },
  { id: 'ort_kb', shortCode: 'KB', fullName: 'Kate Barker', startDate: null, active: true, notes: 'Cleveland only. Formerly also worked at BP' },
  { id: 'ort_mn', shortCode: 'MN', fullName: 'Melissa Nguyen', startDate: '2024-07-11', active: true, notes: null },
  { id: 'ort_kc', shortCode: 'KC', fullName: 'Keith Chan', startDate: '2025-02-03', active: true, notes: null },
  { id: 'ort_steve', shortCode: 'STEVE', fullName: 'Steve Atkin', startDate: null, active: false, notes: 'Retired Jul 2024' },
  { id: 'ort_james', shortCode: 'JAMES', fullName: 'James English', startDate: '2024-02-05', active: false, notes: 'Resigned' },
  { id: 'ort_mojdeh', shortCode: 'MOJDEH', fullName: 'Mojdeh Sassani', startDate: '2024-02-21', active: false, notes: 'Resigned' },
  { id: 'ort_kt', shortCode: 'KT', fullName: 'Katherine Thompson', startDate: '2025-01-06', active: true, notes: 'Locum only. Noosa' },
  { id: 'ort_kwoki', shortCode: 'KWOKI', fullName: 'Kwok Ki Ling', startDate: '2026-02-25', active: true, notes: 'Cleveland' },
  { id: 'ort_mattn', shortCode: 'MATT N', fullName: 'Matthew Nangle', startDate: '2026-12-15', active: true, notes: null },
  { id: 'ort_mattb', shortCode: 'MATT B', fullName: 'Matthew Boubaris', startDate: '2027-02-01', active: true, notes: null },
];

const ORTHO_ALIAS_LIST: Array<[string, string, boolean]> = [
  // Guessed from the plan's codes table. Not yet confirmed.
  ['AC', 'ort_ac', false],
  ['MAT', 'ort_mat', false],
  ['ZS', 'ort_zs', false],
  ['JD', 'ort_jd', false],
  ['OR', 'ort_or', false],
  ['SP', 'ort_sp', false],
  ['TL', 'ort_tl', false],
  ['KSF', 'ort_ksf', false],
  ['NM', 'ort_nm', false],
  ["CO'S", 'ort_cos', false],
  ['KB', 'ort_kb', false],
  ['MN', 'ort_mn', false],
  ['KC', 'ort_kc', false],
  // Short names from the Master List and roster headings (confirmed).
  ['Kent', 'ort_ksf', true],
  ['Marcus', 'ort_mat', true],
  ['Anna', 'ort_ac', true],
  ['Shari', 'ort_sp', true],
  ['Steve', 'ort_steve', true],
  ['Kate', 'ort_kb', true],
  ['Cath', 'ort_cos', true],
  ['Oscar', 'ort_or', true],
  ['James', 'ort_james', true],
  ['Ting', 'ort_tl', true],
  ['Mojdeh', 'ort_mojdeh', true],
  ['Mel', 'ort_mn', true],
  ['Julia', 'ort_jd', true],
  ['Nadine', 'ort_nm', true],
  ['Keith', 'ort_kc', true],
  ['Kwok Ki', 'ort_kwoki', true],
  ['KWOKI', 'ort_kwoki', true],
  ['Zak', 'ort_zs', true],
  ['Matt N', 'ort_mattn', true],
  ['MATT N', 'ort_mattn', true],
  ['Matt B', 'ort_mattb', true],
  ['MATT B', 'ort_mattb', true],
  ['KT', 'ort_kt', false], // collides with staff initials KT. Resolve per referral context.
];

export const ORTHO_ALIASES: OrthoAlias[] = ORTHO_ALIAS_LIST.map(([alias, orthodontistId, confirmed]) => ({
  alias,
  orthodontistId,
  confirmed,
}));

/**
 * Weekday roster, from the Master List "Doctor ROSTER" block.
 * weekday 1 = Monday ... 5 = Friday. Joint sessions ("Kent & Matt B") become two entries.
 */
const ROSTER_ROWS: Array<[clinicId: string, weekday: number, orthodontistIds: string[]]> = [
  ['clin_umg', 1, ['ort_or']],
  ['clin_umg', 2, ['ort_ksf', 'ort_mattb']],
  ['clin_umg', 3, ['ort_or']],
  ['clin_umg', 4, ['ort_nm']],
  ['clin_umg', 5, ['ort_ac']],
  ['clin_bp', 2, ['ort_or']],
  ['clin_bp', 3, ['ort_tl']],
  ['clin_bp', 4, ['ort_mattb']],
  ['clin_bp', 5, ['ort_tl']],
  ['clin_clay', 1, ['ort_mattn']],
  ['clin_clay', 2, ['ort_nm']],
  ['clin_clay', 3, ['ort_sp']],
  ['clin_clay', 4, ['ort_mat', 'ort_mattn']],
  ['clin_clay', 5, ['ort_kc']],
  ['clin_log', 1, ['ort_mattb']],
  ['clin_log', 2, ['ort_ac']],
  ['clin_log', 3, ['ort_mattb']],
  ['clin_log', 4, ['ort_ac']],
  ['clin_log', 5, ['ort_or']],
  ['clin_nl', 1, ['ort_ac']],
  ['clin_nl', 2, ['ort_sp']],
  ['clin_nl', 3, ['ort_ac']],
  ['clin_nl', 4, ['ort_sp']],
  ['clin_nl', 5, ['ort_mn']],
  ['clin_red', 1, ['ort_kc']],
  ['clin_red', 2, ['ort_mattn']],
  ['clin_red', 4, ['ort_mn']],
  ['clin_twg', 3, ['ort_mattn']],
  ['clin_twg', 4, ['ort_cos']],
  ['clin_cle', 3, ['ort_kwoki']],
  ['clin_cle', 4, ['ort_kwoki']],
  ['clin_cle', 5, ['ort_kb']],
  ['clin_car', 2, ['ort_tl']],
  ['clin_car', 3, ['ort_cos']],
  ['clin_car', 4, ['ort_kc']],
  ['clin_car', 5, ['ort_cos']],
  ['clin_coo', 1, ['ort_tl']],
  ['clin_coo', 4, ['ort_tl']],
  ['clin_coo', 5, ['ort_mattb']],
  ['clin_fh', 2, ['ort_kc']],
  ['clin_fh', 3, ['ort_kc']],
  ['clin_fh', 4, ['ort_or']],
  ['clin_fh', 5, ['ort_nm']],
  ['clin_tsv', 2, ['ort_jd']],
  ['clin_tsv', 3, ['ort_jd']],
  ['clin_tsv', 4, ['ort_jd']],
  ['clin_noo', 1, ['ort_zs']],
  ['clin_noo', 2, ['ort_zs']],
  ['clin_noo', 3, ['ort_zs']],
];

export const ROSTER: RosterEntry[] = ROSTER_ROWS.flatMap(([clinicId, weekday, orthos], i) =>
  orthos.map((orthodontistId, j) => ({
    id: `ros_${i}_${j}`,
    clinicId,
    weekday,
    orthodontistId,
    notes: null,
  })),
);

/**
 * Staff initials from the tracker. Names are placeholders until the team confirms them.
 * Roles are a guess: BM as manager so the role switch has a manager to pick. Confirm in Settings.
 */
export const STAFF: Staff[] = [
  { id: 'stf_bm', initials: 'BM', name: 'BM', role: 'manager', active: true },
  { id: 'stf_sl', initials: 'SL', name: 'Susie Mundy', role: 'agent', active: true },
  { id: 'stf_kt', initials: 'KT', name: 'KT', role: 'agent', active: true },
  { id: 'stf_jm', initials: 'JM', name: 'Jackie Mathison', role: 'agent', active: true },
  { id: 'stf_cc', initials: 'CC', name: 'CC', role: 'agent', active: true },
  { id: 'stf_tm', initials: 'TM', name: 'TM', role: 'agent', active: true },
];

export const DEFAULT_LOOKUPS: Lookups = {
  clinics: CLINICS,
  clinicAliases: CLINIC_ALIASES,
  orthodontists: ORTHODONTISTS,
  orthoAliases: ORTHO_ALIASES,
  roster: ROSTER,
  staff: STAFF,
};

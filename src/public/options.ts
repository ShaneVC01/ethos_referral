/**
 * Choices shown on the public form. Public information only (branches and the orthodontists taking
 * new patients). IDs match the staff lookups so a submission maps straight onto the referral.
 * ASSUMPTION: this is a copy of the roster in the Master List, so it must be kept in step with it until
 * a published roster feed replaces it. Future starters are left out.
 */
export const NEAREST_CLINIC = 'nearest';
export const NEXT_AVAILABLE_ORTHO = 'next_available';

export const BRANCHES: Array<{ id: string; name: string }> = [
  { id: 'clin_bp', name: 'Browns Plains' },
  { id: 'clin_car', name: 'Carindale' },
  { id: 'clin_cle', name: 'Cleveland' },
  { id: 'clin_clay', name: 'Clayfield' },
  { id: 'clin_coo', name: 'Upper Coomera' },
  { id: 'clin_fh', name: 'Ferny Hills' },
  { id: 'clin_log', name: 'Loganholme' },
  { id: 'clin_nl', name: 'North Lakes' },
  { id: 'clin_noo', name: 'Noosa' },
  { id: 'clin_red', name: 'Redcliffe' },
  { id: 'clin_tsv', name: 'Townsville' },
  { id: 'clin_twg', name: 'Toowong' },
  { id: 'clin_umg', name: 'Upper Mount Gravatt' },
];

export const ORTHODONTISTS: Array<{ id: string; name: string }> = [
  { id: 'ort_ac', name: 'Anna Chang' },
  { id: 'ort_mat', name: 'Marcus Tod' },
  { id: 'ort_zs', name: 'Zak Sullivan' },
  { id: 'ort_jd', name: 'Julia Dando' },
  { id: 'ort_or', name: 'Oscar Renison' },
  { id: 'ort_sp', name: 'Shari Prove' },
  { id: 'ort_tl', name: 'Ting Lin' },
  { id: 'ort_ksf', name: 'Kent Farmer' },
  { id: 'ort_nm', name: 'Nadine McGiffin' },
  { id: 'ort_cos', name: "Cath O'Shea" },
  { id: 'ort_kb', name: 'Kate Barker' },
  { id: 'ort_mn', name: 'Melissa Nguyen' },
  { id: 'ort_kc', name: 'Keith Chan' },
  { id: 'ort_kt', name: 'Katherine Thompson' },
  { id: 'ort_kwoki', name: 'Kwok Ki Ling' },
];

export const ATTACHMENT_KINDS = [
  { value: 'xray_opg', label: 'X-ray or OPG' },
  { value: 'referral_letter', label: 'Referral letter' },
  { value: 'other', label: 'Other' },
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]['value'];

export const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 6;

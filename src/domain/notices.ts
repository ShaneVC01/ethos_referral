import type { NoticeTemplate } from './entities';
import type { ReferrerNotificationKind } from './enums';

/**
 * Referrer notices: the letters and emails the team sends back to a referrer.
 * Wording is editable in Settings (Referrer emails). Merge fields use single braces, for example {referrerName}.
 * Pure functions only. No React and no data access here.
 */
export const NOTICE_KIND_LABELS: Record<ReferrerNotificationKind, string> = {
  thank_you: 'Thank you',
  missing_info: 'Thank you and missing info',
  unsuccessful_contact: 'Unsuccessful contact',
  referral_returned: 'Referral returned',
};

/** Items a referrer can be asked for on intake. */
export const MISSING_INFO_OPTIONS = ['Mobile number', 'OPG or x-rays', 'Referral letter'] as const;

export const NOTICE_TOKENS = ['referrerName', 'patientName', 'reference', 'clinicName', 'orthoName', 'senderName', 'detail', 'missingItems', 'reason'] as const;
export type NoticeToken = (typeof NOTICE_TOKENS)[number];

export const DEFAULT_NOTICE_TEMPLATES: NoticeTemplate[] = [
  {
    kind: 'thank_you',
    name: 'Thank you',
    subject: 'Thank you for referring {patientName}',
    body: 'Dear {referrerName},\n\nThank you for referring {patientName} to Ethos Orthodontics. Reference {reference}.\n\n{detail}\n\nKind regards,\n{senderName}\nEthos Orthodontics',
  },
  {
    kind: 'missing_info',
    name: 'Thank you and missing info',
    subject: 'Information needed for referral {reference}',
    body: 'Dear {referrerName},\n\nThank you for referring {patientName} to Ethos Orthodontics. To book the first appointment, we still need the following:\n\n{missingItems}\n\nPlease send these when you can. Reference {reference}.\n\nKind regards,\n{senderName}\nEthos Orthodontics',
  },
  {
    kind: 'unsuccessful_contact',
    name: 'Unsuccessful contact',
    subject: 'Referral {reference} closed after contact attempts',
    body: 'Dear {referrerName},\n\nWe have tried to contact {patientName} about this referral by text and phone several times, without success. We have closed referral {reference} as unsuccessful.\n\nIf the patient or parent would still like to be seen, please ask them to contact us directly, or send a new referral.\n\nKind regards,\n{senderName}\nEthos Orthodontics',
  },
  {
    kind: 'referral_returned',
    name: 'Referral returned',
    subject: 'Referral {reference} returned',
    body: 'Dear {referrerName},\n\nWe are returning the referral for {patientName} (reference {reference}) to you.\n\nReason: {reason}\n\nPlease contact us if you have any questions.\n\nKind regards,\n{senderName}\nEthos Orthodontics',
  },
];

/** Saved wording where it exists, the default otherwise. Always four entries, in kind order. */
export function noticeTemplatesOf(saved: NoticeTemplate[] | undefined): NoticeTemplate[] {
  return DEFAULT_NOTICE_TEMPLATES.map((d) => saved?.find((s) => s.kind === d.kind) ?? d);
}

/** Replaces merge fields. Empty or unknown fields stay visible as placeholders, so the editor shows what is missing. */
export function renderNotice(text: string, values: Partial<Record<NoticeToken, string>>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = (NOTICE_TOKENS as readonly string[]).includes(name) ? values[name as NoticeToken] : undefined;
    return v && v.trim() ? v : match;
  });
}

/** Merge fields still open after rendering. Sending is blocked while this is non-empty. */
export function unresolvedNoticeFields(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
}

/** Bulleted list for missing_info notices. */
export function missingItemsText(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

/** mailto: link with the subject and body filled. Opens the default email app with the notice ready to send. */
export function mailtoHref(to: string | null, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

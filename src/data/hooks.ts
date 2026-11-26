/**
 * React Query hooks over the repository. Components use these, never the adapter directly.
 * Writes take actorId explicitly so the audit trail is always attributed.
 * Query keys are exported so feature code can invalidate precisely.
 */
import { keepPreviousData, useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { AppSettings, NewContactAttempt, NewReferral, Practice, ReferrerNotification } from '@/domain';
import { data, demoClock, type BookedAtReceipt, type NewReferrerNotice, type ChangeStatusInput, type ListImportRowsQuery, type HistorySortField, type NoticeQuery, type PageQuery, type ReferralQuery, type ReferrerQuery, type SendSmsInput, type SimulateSmsInput, type SmsQuery, type StageImportRow } from './index';

export const queryKeys = {
  referrals: ['referrals'] as const,
  referralList: (q: ReferralQuery) => ['referrals', 'list', q] as const,
  referral: (id: string) => ['referrals', 'detail', id] as const,
  attachments: (id: string) => ['referrals', 'attachments', id] as const,
  contacts: (referralId: string) => ['contacts', referralId] as const,
  sms: ['sms'] as const,
  smsList: (q: SmsQuery) => ['sms', 'list', q] as const,
  smsTemplates: ['sms', 'templates'] as const,
  referrers: ['referrers'] as const,
  referrerSearch: (q: string) => ['referrers', 'search', q] as const,
  referrerList: (q: ReferrerQuery) => ['referrers', 'list', q] as const,
  referrer: (id: string) => ['referrers', 'detail', id] as const,
  referrerHistory: (id: string) => ['referrers', 'history', id] as const,
  referrerReferrals: (id: string) => ['referrers', 'referrals', id] as const,
  notifications: (referrerId?: string) => ['referrers', 'notifications', referrerId ?? 'all'] as const,
  lookups: ['lookups'] as const,
  staff: ['staff'] as const,
  imports: ['imports'] as const,
  importRows: (q: ListImportRowsQuery) => ['imports', 'rows', q] as const,
  settings: ['settings'] as const,
  audit: (entityId?: string) => ['audit', entityId ?? 'all'] as const,
  referralNotices: (referralId: string) => ['referrers', 'notifications', 'referral', referralId] as const,
};

/** Re-renders when the demo clock moves. Use for queue "today" and overdue labels. */
export function useDemoNow(): Date {
  useSyncExternalStore(
    (cb) => demoClock.subscribe(cb),
    () => demoClock.snapshot(),
    () => demoClock.snapshot(),
  );
  return demoClock.now();
}

/* ---------- reads ---------- */

export function useLookups() {
  return useQuery({ queryKey: queryKeys.lookups, queryFn: () => data.lookups.get(), staleTime: Infinity });
}

export function useStaff() {
  return useQuery({ queryKey: queryKeys.staff, queryFn: () => data.staff.list(), staleTime: 60_000 });
}

export function useReferrals(query: ReferralQuery) {
  return useQuery({
    queryKey: queryKeys.referralList(query),
    queryFn: () => data.referrals.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useReferral(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.referral(id ?? ''),
    queryFn: () => data.referrals.get(id ?? ''),
    enabled: !!id,
  });
}

export function useAttachments(referralId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.attachments(referralId ?? ''),
    queryFn: () => data.referrals.listAttachments(referralId ?? ''),
    enabled: !!referralId,
  });
}

/** Every contact attempt, for Today (Ready to book and last contact). One request for the whole queue. */
export function useAllContacts() {
  return useQuery({ queryKey: ['contacts', 'all'], queryFn: () => data.contacts.listAll() });
}

export function useContacts(referralId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contacts(referralId ?? ''),
    queryFn: () => data.contacts.list(referralId ?? ''),
    enabled: !!referralId,
  });
}

export function useSmsMessages(query: SmsQuery) {
  return useQuery({ queryKey: queryKeys.smsList(query), queryFn: () => data.sms.list(query), placeholderData: keepPreviousData });
}

export function useSmsTemplates() {
  return useQuery({ queryKey: queryKeys.smsTemplates, queryFn: () => data.sms.templates(), staleTime: Infinity });
}

export function useReferrerSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.referrerSearch(q),
    queryFn: () => data.referrers.search(q, 20),
    enabled: enabled && q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
}

export function useReferrers(query: ReferrerQuery) {
  return useQuery({
    queryKey: queryKeys.referrerList(query),
    queryFn: () => data.referrers.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useReferrer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.referrer(id ?? ''),
    queryFn: () => data.referrers.get(id ?? ''),
    enabled: !!id,
  });
}

export function useReferrerHistory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.referrerHistory(id ?? ''),
    queryFn: () => data.referrers.history(id ?? ''),
    enabled: !!id,
  });
}

/** One server page of a referrer's Edge history. Sorted and paged on the server. */
export function useReferrerHistoryPage(id: string | undefined, query: PageQuery<HistorySortField>) {
  return useQuery({
    queryKey: [...queryKeys.referrerHistory(id ?? ''), 'page', query] as const,
    queryFn: () => data.referrers.historyPage(id ?? '', query),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** One server page of referrer notices. Filters, search and sort run on the server. */
/** FY25 and FY26 Edge counts for a referrer profile (server aggregate). */
export function useReferrerHistoryStats(id: string | undefined) {
  return useQuery({
    queryKey: ['referrers', 'historyStats', id ?? ''] as const,
    queryFn: () => data.referrers.historyStats(id ?? ''),
    enabled: !!id,
  });
}

export function useNoticesPage(query: NoticeQuery) {
  return useQuery({
    queryKey: ['referrers', 'notifications', 'page', query] as const,
    queryFn: () => data.referrers.noticesPage(query),
    placeholderData: keepPreviousData,
  });
}

/** Distinct professional types for the referrer filter, from the server (not from a page of rows). */
export function useReferrerTypes() {
  return useQuery({ queryKey: ['referrers', 'types'] as const, queryFn: () => data.referrers.types(), staleTime: 5 * 60_000 });
}

export function useReferrerReferrals(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.referrerReferrals(id ?? ''),
    queryFn: () => data.referrers.referrals(id ?? ''),
    enabled: !!id,
  });
}

export function useReferrerNotifications(referrerId?: string, status?: ReferrerNotification['status']) {
  return useQuery({
    queryKey: [...queryKeys.notifications(referrerId), status ?? 'any'] as const,
    queryFn: () => data.referrers.listNotifications({ referrerId, status }),
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => data.settings.get(), staleTime: 60_000 });
}

export function useImportBatches() {
  return useQuery({ queryKey: queryKeys.imports, queryFn: () => data.imports.listBatches() });
}

export function useImportRows(query: ListImportRowsQuery | undefined) {
  return useQuery({
    queryKey: queryKeys.importRows(query ?? { batchId: '' }),
    queryFn: () => data.imports.listRows(query ?? { batchId: '' }),
    enabled: !!query?.batchId,
    placeholderData: keepPreviousData,
  });
}

export function useAudit(entityId?: string) {
  return useQuery({
    queryKey: queryKeys.audit(entityId),
    queryFn: () => data.audit.list({ entityId, limit: 100 }),
  });
}

/** Referrals whose patient name or phone matches a search, for duplicate checks. Empty search does not run. */
export function useReferralMatches(search: string, enabled = true) {
  const q = search.trim();
  return useQuery({
    queryKey: ['referrals', 'matches', q] as const,
    queryFn: () => data.referrals.list({ search: q, limit: 50 }),
    enabled: enabled && q.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** All practices as a Map by id. One cached call, for lists that sort or filter by practice name or suburb. */
export function usePractices() {
  return useQuery({
    queryKey: ['referrers', 'practices'] as const,
    queryFn: () => data.referrers.practices(),
    staleTime: Infinity,
    select: (list) => new Map(list.map((p) => [p.id, p])),
  });
}

/** One practice record (name, suburb). Cached, so a virtualised list only fetches the rows it shows. */
export function usePractice(id: string | null | undefined) {
  return useQuery({
    queryKey: ['referrers', 'practice', id ?? ''] as const,
    queryFn: () => data.referrers.practice(id ?? ''),
    enabled: !!id,
    staleTime: Infinity,
  });
}

/** Practices for a short list of ids (typeahead options). Returns a map keyed by practice id. */
export function usePracticeMap(ids: Array<string | null | undefined>): Map<string, Practice> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ['referrers', 'practice', id] as const,
      queryFn: () => data.referrers.practice(id),
      staleTime: Infinity,
    })),
  });
  const map = new Map<string, Practice>();
  results.forEach((r, i) => {
    const id = unique[i];
    if (r.data && id) map.set(id, r.data);
  });
  return map;
}

/* ---------- writes ---------- */

/** Invalidate everything a referral change can touch: lists, detail, contacts, audit and referrer stats. */
function useInvalidateReferralWorld() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.referrals }),
      qc.invalidateQueries({ queryKey: ['contacts'] }),
      qc.invalidateQueries({ queryKey: ['audit'] }),
      qc.invalidateQueries({ queryKey: queryKeys.referrers }),
    ]);
}

export function useCreateReferral() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { input: NewReferral; actorId: string }) => data.referrals.create(vars.input, vars.actorId),
    onSuccess: invalidate,
  });
}

export function useUpdateReferral() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { id: string; patch: Partial<NewReferral>; actorId: string }) =>
      data.referrals.update(vars.id, vars.patch, vars.actorId),
    onSuccess: invalidate,
  });
}

export function useChangeStatus() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { id: string; input: ChangeStatusInput; actorId: string }) =>
      data.referrals.changeStatus(vars.id, vars.input, vars.actorId),
    onSuccess: invalidate,
  });
}

export function useSetAgeGroupOverride() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { id: string; ageGroup: 'A' | 'Y' | 'C' | null; actorId: string }) =>
      data.referrals.setAgeGroupOverride(vars.id, vars.ageGroup, vars.actorId),
    onSuccess: invalidate,
  });
}

export function useAddAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { referralId: string; file: { fileName: string; sizeBytes: number; mimeType: string; storagePath: string }; actorId: string }) =>
      data.referrals.addAttachment(vars.referralId, vars.file, vars.actorId),
    onSuccess: (_result, vars) => qc.invalidateQueries({ queryKey: queryKeys.attachments(vars.referralId) }),
  });
}

export function useRemoveAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { attachmentId: string; referralId: string; actorId: string }) =>
      data.referrals.removeAttachment(vars.attachmentId, vars.actorId),
    onSuccess: (_result, vars) => qc.invalidateQueries({ queryKey: queryKeys.attachments(vars.referralId) }),
  });
}

export function useLogContact() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { input: NewContactAttempt; actorId: string }) => data.contacts.log(vars.input, vars.actorId),
    onSuccess: invalidate,
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: SendSmsInput; actorId: string }) => data.sms.send(vars.input, vars.actorId),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.sms }), qc.invalidateQueries({ queryKey: ['audit'] })]),
  });
}

export function useResendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { messageId: string; correctedPhone: string | null; actorId: string }) =>
      data.sms.resend(vars.messageId, vars.correctedPhone, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sms }),
  });
}

export function useResolveSmsReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { messageId: string; actorId: string }) => data.sms.resolveReview(vars.messageId, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sms }),
  });
}

export function useLinkInbound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { messageId: string; referralId: string; actorId: string }) =>
      data.sms.linkInbound(vars.messageId, vars.referralId, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sms }),
  });
}

export function useSimulateSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: SimulateSmsInput; actorId: string }) => data.sms.simulate(vars.input, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sms }),
  });
}

export function useStageImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fileName: string; rows: StageImportRow[]; actorId: string }) =>
      data.imports.stage(vars.fileName, vars.rows, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.imports }),
  });
}

export function useCommitImport() {
  const qc = useQueryClient();
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { batchId: string; actorId: string }) => data.imports.commit(vars.batchId, vars.actorId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.imports });
      await invalidate();
    },
  });
}

export function useRollbackImport() {
  const qc = useQueryClient();
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { batchId: string; actorId: string }) => data.imports.rollback(vars.batchId, vars.actorId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.imports });
      await invalidate();
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { patch: Partial<Omit<AppSettings, 'id'>>; actorId: string }) => data.settings.update(vars.patch, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof data.staff.update>[1]; actorId: string }) =>
      data.staff.update(vars.id, vars.patch, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff }),
  });
}

export function useUpdateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: 'sent' | 'dismissed'; actorId: string; email?: { subject: string; body: string } | null }) =>
      data.referrers.updateNotification(vars.id, vars.status, vars.actorId, vars.email ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.referrers }),
  });
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { input: NewReferrerNotice; actorId: string }) => data.referrers.createNotification(vars.input, vars.actorId),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.referrers }), qc.invalidateQueries({ queryKey: ['audit'] })]),
  });
}

/** Notices for one referral, for the referral detail. */
export function useReferralNotices(referralId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.referralNotices(referralId ?? ''),
    queryFn: () => data.referrers.listNotifications({ referralId }),
    enabled: !!referralId,
  });
}

export function useSetUrgent() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { id: string; urgent: boolean; reason: string; actorId: string }) => data.referrals.setUrgent(vars.id, vars.urgent, vars.reason, vars.actorId),
    onSuccess: invalidate,
  });
}

export function useCreateBooked() {
  const invalidate = useInvalidateReferralWorld();
  return useMutation({
    mutationFn: (vars: { input: NewReferral; booking: BookedAtReceipt; actorId: string }) => data.referrals.createBooked(vars.input, vars.booking, vars.actorId),
    onSuccess: invalidate,
  });
}

/**
 * Supabase adapter stub. Typed to the same DataRepository contract as the mock, so switching
 * VITE_DATA_ADAPTER=supabase needs no UI change once implemented. Every method throws until then.
 * Planned: migrations 0001 to 0003 in supabase/, RLS per plan, Edge Functions for public submit and Coax.
 */
import type { DataRepository } from '@/data/repository';

function notImplemented(method: string): never {
  throw new Error(`Supabase adapter not implemented: ${method}`);
}

export function createSupabaseRepository(): DataRepository {
  return {
    referrals: {
      list: async () => notImplemented('referrals.list'),
      queue: async () => notImplemented('referrals.queue'),
      summary: async () => notImplemented('referrals.summary'),
      exportCsv: async () => notImplemented('referrals.exportCsv'),
      possibleDuplicates: async () => notImplemented('referrals.possibleDuplicates'),
      get: async () => notImplemented('referrals.get'),
      create: async () => notImplemented('referrals.create'),
      update: async () => notImplemented('referrals.update'),
      changeStatus: async () => notImplemented('referrals.changeStatus'),
      setUrgent: async () => notImplemented('referrals.setUrgent'),
      createBooked: async () => notImplemented('referrals.createBooked'),
      setAgeGroupOverride: async () => notImplemented('referrals.setAgeGroupOverride'),
      listAttachments: async () => notImplemented('referrals.listAttachments'),
      addAttachment: async () => notImplemented('referrals.addAttachment'),
      removeAttachment: async () => notImplemented('referrals.removeAttachment'),
    },
    contacts: {
      list: async () => notImplemented('contacts.list'),
      listAll: async () => notImplemented('contacts.listAll'),
      log: async () => notImplemented('contacts.log'),
    },
    sms: {
      templates: async () => notImplemented('sms.templates'),
      saveTemplate: async () => notImplemented('sms.saveTemplate'),
      list: async () => notImplemented('sms.list'),
      send: async () => notImplemented('sms.send'),
      resend: async () => notImplemented('sms.resend'),
      resolveReview: async () => notImplemented('sms.resolveReview'),
      linkInbound: async () => notImplemented('sms.linkInbound'),
      simulate: async () => notImplemented('sms.simulate'),
    },
    referrers: {
      search: async () => notImplemented('referrers.search'),
      list: async () => notImplemented('referrers.list'),
      get: async () => notImplemented('referrers.get'),
      history: async () => notImplemented('referrers.history'),
      referrals: async () => notImplemented('referrers.referrals'),
      listNotifications: async () => notImplemented('referrers.listNotifications'),
      createNotification: async () => notImplemented('referrers.createNotification'),
      updateNotification: async () => notImplemented('referrers.updateNotification'),
      practice: async () => notImplemented('referrers.practice'),
      practices: async () => notImplemented('referrers.practices'),
      historyPage: async () => notImplemented('referrers.historyPage'),
      historyStats: async () => notImplemented('referrers.historyStats'),
      existingIds: async () => notImplemented('referrers.existingIds'),
      matchNames: async () => notImplemented('referrers.matchNames'),
      noticesPage: async () => notImplemented('referrers.noticesPage'),
      types: async () => notImplemented('referrers.types'),
    },
    lookups: {
      get: async () => notImplemented('lookups.get'),
      update: async () => notImplemented('lookups.update'),
    },
    staff: {
      list: async () => notImplemented('staff.list'),
      update: async () => notImplemented('staff.update'),
    },
    imports: {
      stage: async () => notImplemented('imports.stage'),
      listBatches: async () => notImplemented('imports.listBatches'),
      listRows: async () => notImplemented('imports.listRows'),
      commit: async () => notImplemented('imports.commit'),
      rollback: async () => notImplemented('imports.rollback'),
    },
    settings: {
      get: async () => notImplemented('settings.get'),
      update: async () => notImplemented('settings.update'),
    },
    audit: {
      list: async () => notImplemented('audit.list'),
    },
    // Dashboard aggregates. In Supabase this is one SQL function (rpc 'dashboard_metrics'), not a client-side
    // calculation: the database runs every KPI over the full table and returns only the aggregates.
    // Sketch: supabase/migrations/0003_views.sql (not applied yet).
    dashboard: {
      metrics: async () => notImplemented('dashboard.metrics'),
    },
  };
}

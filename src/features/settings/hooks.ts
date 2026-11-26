import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@/data';
import { queryKeys } from '@/data/hooks';
import type { SmsTemplate } from '@/domain';
import type { Lookups } from '@/data/repository';

/** Saves one SMS template. Keys are fixed, so only name and body change. */
export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { template: SmsTemplate; actorId: string }) => data.sms.saveTemplate(vars.template, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.smsTemplates }),
  });
}

/** Replaces clinic, orthodontist, alias or roster collections. */
export function useUpdateLookups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { patch: Partial<Pick<Lookups, 'clinics' | 'clinicAliases' | 'orthodontists' | 'orthoAliases' | 'roster'>>; actorId: string }) =>
      data.lookups.update(vars.patch, vars.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.lookups }),
  });
}

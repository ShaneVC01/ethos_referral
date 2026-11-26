import { addDays, addMonths, format, parseISO, startOfDay } from 'date-fns';
import { enAU } from 'date-fns/locale';
import type { CadenceSettings, Referral } from './entities';
import type { ReferralStatus } from './enums';

/**
 * Cadence from the process document (Ethos_Referrals_Team_Process.docx):
 *   step 0  Day 0          Coax #1 (SMS, standard, existing family or transfer template)
 *   step 1  Day 1          call, then Coax #2
 *   step 2  Day 14         call, then Coax #3
 *   step 3  3 months       final call, then Coax #4, then close as unsuccessful and advise the referrer
 * currentStep on a referral = number of steps completed (0 to 4). 4 = cadence finished.
 * Offsets are measured from receivedAt. Managers can change them in Settings.
 */
export const DEFAULT_CADENCE: CadenceSettings = {
  steps: [
    { step: 0, label: 'Coax #1', offsetAmount: 0, offsetUnit: 'day', templateKey: 'coax_1_standard' },
    { step: 1, label: 'Day 1 call and Coax #2', offsetAmount: 1, offsetUnit: 'day', templateKey: 'coax_2' },
    { step: 2, label: 'Day 14 call and Coax #3', offsetAmount: 14, offsetUnit: 'day', templateKey: 'coax_3' },
    { step: 3, label: '3 month final call and Coax #4', offsetAmount: 3, offsetUnit: 'month', templateKey: 'coax_4_final' },
  ],
  closeUnsuccessfulAfterFinal: true,
  notifyReferrerOnUnsuccessful: true,
};

/**
 * Statuses that stop the cadence. to_call_us is open: the patient said they will call, so the cadence still runs
 * (Day 14 and the 3 month final call) until the referral is booked or closed.
 */
export const CLOSED_STATUSES: readonly ReferralStatus[] = ['booked', 'do_not_contact', 'unsuccessful', 'declined'];

export function isOpenStatus(status: ReferralStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

export interface NextAction {
  /** Cadence step index (0 to 3) that is due next. */
  step: number;
  /** Plain language, e.g. "Day 14 call and Coax #3 due Thu 4 Dec" or "... overdue, due Mon 1 Dec". */
  label: string;
  /** ISO datetime the step is due. */
  dueAt: string;
  /** True when the due date is before today (date-only comparison in clinic time). */
  overdue: boolean;
}

/** Due date for a cadence step, measured from receivedAt. */
export function stepDueAt(receivedAt: string, cadence: CadenceSettings, step: number): Date {
  const cfg = cadence.steps[step];
  const base = parseISO(receivedAt);
  if (!cfg) return base;
  return cfg.offsetUnit === 'month' ? addMonths(base, cfg.offsetAmount) : addDays(base, cfg.offsetAmount);
}

/**
 * The next cadence action for a referral, or null when the referral is closed or the cadence is finished.
 * `today` is the demo clock or real time. Comparisons use the clinic calendar day.
 */
export function nextAction(referral: Pick<Referral, 'status' | 'currentStep' | 'receivedAt' | 'closedReason'>, cadence: CadenceSettings, today: Date): NextAction | null {
  if (referral.closedReason || !isOpenStatus(referral.status)) return null;
  if (referral.currentStep >= 4) return null;
  const step = referral.currentStep;
  const cfg = cadence.steps[step];
  if (!cfg) return null;
  const dueDate = stepDueAt(referral.receivedAt, cadence, step);
  const overdue = startOfDay(dueDate).getTime() < startOfDay(today).getTime();
  const when = format(dueDate, 'EEE d MMM', { locale: enAU });
  return {
    step,
    label: overdue ? `${cfg.label} overdue, was due ${when}` : `${cfg.label} due ${when}`,
    dueAt: dueDate.toISOString(),
    overdue,
  };
}

/**
 * Step tracker position for the StepTracker component.
 * Stages: 0 Received, 1 Coax #1, 2 Day 1, 3 Day 14, 4 3 months, 5 Closed.
 * Returns the index of the current stage. Closed referrals return 5.
 */
export function trackerStageIndex(referral: Pick<Referral, 'status' | 'currentStep' | 'closedReason'>): number {
  if (referral.closedReason || !isOpenStatus(referral.status)) return 5;
  return Math.min(referral.currentStep + 1, 4);
}

export const TRACKER_STAGE_LABELS = ['Received', 'Coax #1', 'Day 1', 'Day 14', '3 months', 'Closed'] as const;

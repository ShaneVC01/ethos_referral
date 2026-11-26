import { OUTCOME_META, formatDateTime, stepDueAt, type CadenceSettings, type ContactAttempt, type Referral, type SmsMessage } from '@/domain';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ICONS } from '@/components/ui/icons';
import { shortDate, clinicDay } from './queue-model';

const STEP_TITLES = ['SMS', '1st call', '2nd call', '3rd call'] as const;
const STEP_TIMING = ['Within 24h', 'Day 1', 'Day 14', '3 months'] as const;
const STEP_LOG_LABEL = ['Send SMS', 'Log 1st call', 'Log 2nd call', 'Log 3rd call'] as const;

export interface ContactStepperProps {
  referral: Referral;
  cadence: CadenceSettings;
  contacts: ContactAttempt[];
  texts: SmsMessage[];
  staffName: (id: string | null) => string;
  canLog: boolean;
  now: Date;
  onLog: (step: number) => void;
}

/**
 * Contact timeline as a vertical stepper: SMS, 1st call, 2nd call, 3rd call. Done steps show a check, the current
 * step shows its due date and an inline log action, and later steps show the date they fall due.
 */
export function ContactStepper({ referral, cadence, contacts, texts, staffName, canLog, now, onLog }: ContactStepperProps) {
  const open = !referral.closedReason;
  const done = Math.min(referral.currentStep, 4);
  const today = clinicDay(now);
  return (
    <section aria-label="Contact timeline" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 shadow-card">
      <h2 className="text-lg font-semibold text-ink">Contact timeline</h2>
      <ol className="flex flex-col">
        {STEP_TITLES.map((title, i) => {
          const due = stepDueAt(referral.receivedAt, cadence, i);
          const dueDay = clinicDay(due);
          const isDone = i < done;
          const isCurrent = open && i === done && done < 4;
          const overdue = isCurrent && dueDay < today;
          const stepContacts = contacts.filter((c) => c.step === i);
          const stepTexts = i === 0 ? texts.filter((m) => m.direction === 'outbound' && m.templateKey?.startsWith('coax_1')) : [];
          const isLast = i === 3;
          return (
            <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
              {isLast ? null : <span aria-hidden="true" className={cn('absolute left-[15px] top-8 bottom-0 w-0.5', isDone ? 'bg-accent' : 'bg-line')} />}
              <span
                aria-hidden="true"
                className={cn(
                  'relative flex size-8 shrink-0 items-center justify-center rounded-pill border-2 text-sm font-semibold',
                  isDone && 'border-accent bg-accent text-accent-fg',
                  isCurrent && 'border-warn bg-warn-bg text-warn-fg',
                  !isDone && !isCurrent && 'border-line-strong bg-surface text-ink-muted',
                )}
              >
                {isDone ? <ICONS.check size={16} strokeWidth={2} /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-base font-semibold text-ink">
                    {title} <span className="text-sm font-normal text-ink-muted">· {STEP_TIMING[i]}</span>
                  </p>
                  <span className={cn('tabular text-sm', overdue ? 'font-semibold text-danger' : 'text-ink-muted')}>
                    {isDone ? 'Done' : overdue ? `Overdue, due ${shortDate(due)}` : `Due ${shortDate(due)}`}
                  </span>
                </div>
                {stepTexts.slice(0, 1).map((m) => (
                  <span key={m.id} className={cn('inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-sm', m.status === 'failed' ? 'bg-danger-bg text-danger' : 'bg-ok-bg text-ok')}>
                    <span aria-hidden="true" className={cn('size-2 rounded-pill', m.status === 'failed' ? 'bg-danger' : 'bg-ok')} />
                    {m.status === 'failed' ? 'SMS failed' : 'SMS delivered'}
                    <span className="text-ink-muted">· {formatDateTime(m.createdAt)}</span>
                  </span>
                ))}
                {stepContacts.map((c) => (
                  <span key={c.id} className="inline-flex w-fit flex-wrap items-center gap-1.5 rounded-control bg-panel px-2.5 py-1 text-sm text-ink">
                    {OUTCOME_META[c.outcome].label}
                    <span className="text-ink-muted">
                      · {formatDateTime(c.at)}
                      {staffName(c.staffId) ? `, ${staffName(c.staffId)}` : ''}
                    </span>
                  </span>
                ))}
                {isCurrent && canLog && i >= 1 ? (
                  <Button variant="secondary" icon="phone" className="w-fit" onClick={() => onLog(i)}>
                    {STEP_LOG_LABEL[i]}
                  </Button>
                ) : null}
                {isCurrent && i === 0 && canLog ? (
                  <Button variant="secondary" icon="send" className="w-fit" onClick={() => onLog(0)}>
                    {STEP_LOG_LABEL[0]}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

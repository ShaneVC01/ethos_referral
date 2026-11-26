import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/forms';
import { DatePicker } from '@/components/ui/date-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/surfaces';
import { Badge } from '@/components/ui/badges';
import { toast, notifyError } from '@/components/ui/toast';
import { useAddAttachment, useCreateBooked, useCreateNotification, useCreateReferral, useDemoNow, useLookups, useSendSms, useSmsTemplates, useStaff } from '@/data/hooks';
import { AGE_GROUP_LABELS, deriveAgeGroup, formatAuMobile, type AgeGroup } from '@/domain';
import { maskPhoneInput } from '@/public/format';
import { NEAREST_CLINIC, NEXT_AVAILABLE_ORTHO } from '@/public/bridge';
import { ACCEPTED_TYPES_LABEL_STAFF, ALLOWED_MIME, MAX_FILE_BYTES, MAX_STAGED_FILES } from './intakeFiles';
import {
  clinicDay,
  clinicForText,
  emptyIntake,
  FLAG_OPTIONS,
  listAnd,
  missingInfoItems,
  normaliseDraft,
  renderCoax,
  SOURCE_OPTIONS,
  TEMPLATE_OPTIONS,
  toNewReferral,
  validateIntake,
  type IntakeState,
} from './intakeModel';
import { DuplicateWarning } from './DuplicateWarning';
import { ReferrerPicker } from './ReferrerPicker';

const DRAFT_KEY = 'ethos.referrals.intakeDraft.v1';

const FIELD_IDS: Record<string, string> = {
  source: 'intake-source',
  receivedDate: 'intake-received',
  'patient.firstName': 'intake-firstName',
  'patient.lastName': 'intake-lastName',
  'patient.phone': 'intake-phone',
  'patient.email': 'intake-email',
  'referrer.name': 'intake-referrerName',
  'referrer.phone': 'intake-referrerPhone',
  'referrer.email': 'intake-referrerEmail',
  'booking.edgePatientId': 'intake-edge',
  'booking.appointmentDate': 'intake-appt',
  'booking.bookedBy': 'intake-bookedBy',
  'preferences.clinicId': 'intake-clinic',
  'preferences.orthodontistId': 'intake-ortho',
  urgentReason: 'intake-urgentReason',
};

interface StagedFile {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
}

function loadDraft(): IntakeState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? normaliseDraft(JSON.parse(raw) as Partial<IntakeState>, clinicDay(new Date())) : null;
  } catch {
    return null;
  }
}

function saveDraft(state: IntakeState | null): void {
  try {
    if (state) localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Blocked storage: the form still works without a draft.
  }
}

/**
 * New referral (manual intake). Source, dates, patient, preferences, referrer and flags, with a live
 * duplicate check. Saving creates the referral, attaches the files and queues Coax #1 when there is a mobile.
 * The Coax text is shown before saving, so the agent sees exactly what will be sent and to whom.
 */
export function NewReferralPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const demoNow = useDemoNow();
  const today = clinicDay(demoNow);
  const lookups = useLookups();
  const staff = useStaff();
  const templates = useSmsTemplates();
  const createReferral = useCreateReferral();
  const addAttachment = useAddAttachment();
  const sendSms = useSendSms();
  const createBooked = useCreateBooked();
  const createNotice = useCreateNotification();

  const presetReferrerId = params.get('referrer');

  const [state, setState] = useState<IntakeState>(() => {
    const draft = loadDraft();
    if (draft && !presetReferrerId) return draft;
    const base = emptyIntake(today);
    return presetReferrerId ? { ...base, referrer: { ...base.referrer, referrerId: presetReferrerId } } : base;
  });
  const [restoredDraft, setRestoredDraft] = useState(() => !presetReferrerId && loadDraft() !== null);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const sourceRef = useRef<HTMLSelectElement>(null);

  const errors = validateIntake(state);
  const errorFor = (key: string) => (touched[key] || attempted ? errors[key] : undefined);
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }));
  const update = (fn: (s: IntakeState) => IntakeState) => setState((s) => fn(s));

  // Autosave. A blank form clears the draft, so a saved referral never leaves one behind.
  const blank = JSON.stringify(emptyIntake(today));
  useEffect(() => {
    saveDraft(JSON.stringify(state) === blank ? null : state);
  }, [state, blank]);

  const activeClinics = (lookups.data?.clinics ?? []).filter((c) => c.active);
  const activeOrthos = (lookups.data?.orthodontists ?? []).filter((o) => o.active).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeStaff = (staff.data ?? []).filter((s) => s.active);
  const derived: AgeGroup | null = state.patient.dob ? deriveAgeGroup(state.patient.dob, `${state.receivedDate}T12:00:00+10:00`) : null;
  const template = templates.data?.find((t) => t.key === state.templateKey);
  const clinicText = clinicForText(lookups.data, state.preferences.clinicId === 'nearest' ? null : state.preferences.clinicId, state.preferences.clinicId === 'nearest');
  const preview = renderCoax(template, { firstName: state.patient.firstName.trim() || 'patient', clinic: clinicText, reference: 'added on save' });

  function focusFirstError(keys: string[]) {
    const first = keys[0];
    if (!first) return;
    window.setTimeout(() => {
      const id = FIELD_IDS[first] ?? first;
      const el = document.getElementById(id) ?? sourceRef.current;
      el?.focus();
    }, 0);
  }

  function addFiles(list: FileList) {
    const room = MAX_STAGED_FILES - files.length;
    const picked = Array.from(list);
    if (picked.length > room) setFileNotice(`You can attach up to ${MAX_STAGED_FILES} files. Some were not added.`);
    else setFileNotice(null);
    const accepted: StagedFile[] = [];
    for (const file of picked.slice(0, Math.max(room, 0))) {
      if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
        setFileNotice(`${file.name} was not added. ${ACCEPTED_TYPES_LABEL_STAFF}.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileNotice(`${file.name} is larger than 2 MB and was not added.`);
        continue;
      }
      accepted.push({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, sizeBytes: file.size, mimeType: file.type });
    }
    setFiles((f) => [...f, ...accepted]);
  }

  function reset() {
    setState(emptyIntake(today));
    setFiles([]);
    setFileNotice(null);
    setTouched({});
    setAttempted(false);
    setRestoredDraft(false);
    saveDraft(null);
  }

  async function save() {
    const found = validateIntake(state);
    const keys = Object.keys(found);
    if (keys.length > 0) {
      setAttempted(true);
      focusFirstError(keys);
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      const booked = state.booking.enabled;
      const referral = booked
        ? await createBooked.mutateAsync({
            input: toNewReferral(state, demoNow),
            booking: {
              edgePatientId: state.booking.edgePatientId.trim(),
              appointmentDate: state.booking.appointmentDate ?? today,
              bookedBy: state.booking.bookedBy.trim(),
              differentOrthodontist: state.booking.differentOrthodontist,
              thankYouNotice: state.booking.thankYouNotice && !!state.referrer.referrerId,
            },
            actorId: user.id,
          })
        : await createReferral.mutateAsync({ input: toNewReferral(state, demoNow), actorId: user.id });

      for (const f of files) {
        await addAttachment.mutateAsync({
          referralId: referral.id,
          file: { fileName: f.name, sizeBytes: f.sizeBytes, mimeType: f.mimeType, storagePath: `intake/${referral.id}/${f.name}` },
          actorId: user.id,
        });
      }

      let coaxNote = booked ? 'Saved as booked. No Coax text is sent.' : 'No mobile number, so Coax #1 is not queued. Add the number to send it.';
      if (!booked && referral.phone && template) {
        const rendered = renderCoax(template, {
          firstName: referral.patientFirstName,
          clinic: clinicForText(lookups.data, referral.preferredClinicId, referral.preferredClinicIsNearest),
          reference: referral.referenceNumber,
        });
        if (rendered.open.length === 0) {
          const sent = await sendSms.mutateAsync({
            input: { referralId: referral.id, toPhone: referral.phone, body: rendered.body, templateKey: template.key, step: 0 },
            actorId: user.id,
          });
          coaxNote =
            sent.status === 'failed'
              ? `Coax #1 failed: ${sent.error ?? 'unknown error'}. Fix the number in Inbox.`
              : `Coax #1 queued to ${formatAuMobile(referral.phone)}.`;
        }
      }

      // Missing information: a notice to the referrer asking for what is missing. Not for online or booked referrals.
      const missing = booked ? [] : missingInfoItems(state);
      if (missing.length) {
        if (referral.referrerId) {
          await createNotice.mutateAsync({ input: { referralId: referral.id, kind: 'missing_info', missingItems: missing }, actorId: user.id });
          coaxNote = `${coaxNote} Notice to the referrer asks for ${listAnd(missing)}.`;
        } else {
          coaxNote = `${coaxNote} No referrer from the master list, so no notice was created.`;
        }
      }

      reset();
      toast.success(booked ? `Referral ${referral.referenceNumber} saved as booked` : `Referral ${referral.referenceNumber} saved`, {
        description: coaxNote,
        action: { label: 'Open referral', onClick: () => navigate(`/referrals/${referral.id}`) },
      });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The referral could not be saved. Your entries are still here.');
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save();
  }

  return (
    <>
      <PageHeader
        title="New referral"
        description="Enter a referral received by phone, email or scan. Saving queues Coax #1 to the patient."
        actions={
          <Button variant="ghost" icon="trash" onClick={reset} disabled={saving}>
            Clear form
          </Button>
        }
      />

      {restoredDraft ? (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-base">
          <span className="text-ink">Draft restored from this device. It is kept until you save or clear the form.</span>
          <Button variant="secondary" size="sm" onClick={reset}>
            Discard draft
          </Button>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={onSubmit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
        aria-label="New referral"
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Source and date">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source" required error={errorFor('source')} id="intake-source">
                <Select
                  ref={sourceRef}
                  value={state.source}
                  onChange={(e) => update((s) => ({ ...s, source: e.target.value as IntakeState['source'] }))}
                  onBlur={() => touch('source')}
                >
                  <option value="">Choose a source</option>
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <DatePicker
                label="Date received"
                id="intake-received"
                value={state.receivedDate || null}
                max={today}
                onChange={(v) => update((s) => ({ ...s, receivedDate: v ?? '' }))}
                invalid={!!errorFor('receivedDate')}
                errorText={errorFor('receivedDate')}
              />
            </div>
          </Panel>

          <Panel title="Already booked in Edge" description="For a consult booked before the referral arrived. It is saved as booked: no Coax text, and it never enters the queue.">
            <div className="flex flex-col gap-4">
              <Checkbox
                id="intake-booked"
                checked={state.booking.enabled}
                onCheckedChange={(v) => update((s) => ({ ...s, booking: { ...s.booking, enabled: v } }))}
                label="Already booked in Edge"
              />
              {state.booking.enabled ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Edge patient ID" required error={errorFor('booking.edgePatientId')} id="intake-edge" hint="Copy it from Edge exactly as shown.">
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        value={state.booking.edgePatientId}
                        onChange={(e) => update((s) => ({ ...s, booking: { ...s.booking, edgePatientId: e.target.value } }))}
                        onBlur={() => touch('booking.edgePatientId')}
                      />
                    </Field>
                    <DatePicker
                      id="intake-appt"
                      label="Appointment date"
                      value={state.booking.appointmentDate}
                      onChange={(v) => {
                        update((s) => ({ ...s, booking: { ...s.booking, appointmentDate: v } }));
                        touch('booking.appointmentDate');
                      }}
                      invalid={!!errorFor('booking.appointmentDate')}
                      errorText={errorFor('booking.appointmentDate')}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Clinic booked" required id="intake-clinic" error={errorFor('preferences.clinicId')}>
                      <Select
                        value={state.preferences.clinicId}
                        onChange={(e) => update((s) => ({ ...s, preferences: { ...s.preferences, clinicId: e.target.value } }))}
                        onBlur={() => touch('preferences.clinicId')}
                      >
                        <option value={NEAREST_CLINIC}>Choose a clinic</option>
                        {activeClinics.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Orthodontist booked with" required id="intake-ortho" error={errorFor('preferences.orthodontistId')}>
                      <Select
                        value={state.preferences.orthodontistId}
                        onChange={(e) => update((s) => ({ ...s, preferences: { ...s.preferences, orthodontistId: e.target.value } }))}
                        onBlur={() => touch('preferences.orthodontistId')}
                      >
                        <option value={NEXT_AVAILABLE_ORTHO}>Choose an orthodontist</option>
                        {activeOrthos.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.fullName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Booked by" required id="intake-bookedBy" error={errorFor('booking.bookedBy')} hint="For example the call centre, or a staff member.">
                    <Input
                      autoComplete="off"
                      value={state.booking.bookedBy}
                      onChange={(e) => update((s) => ({ ...s, booking: { ...s.booking, bookedBy: e.target.value } }))}
                      onBlur={() => touch('booking.bookedBy')}
                    />
                  </Field>
                  <Checkbox
                    id="intake-diff-ortho"
                    checked={state.booking.differentOrthodontist}
                    onCheckedChange={(v) => update((s) => ({ ...s, booking: { ...s.booking, differentOrthodontist: v } }))}
                    label="Consult booked with a different orthodontist than referred"
                    description="Adds a note to the referral, and the thank you notice says so."
                  />
                  <Checkbox
                    id="intake-thanks"
                    checked={state.booking.thankYouNotice}
                    disabled={!state.referrer.referrerId}
                    onCheckedChange={(v) => update((s) => ({ ...s, booking: { ...s.booking, thankYouNotice: v } }))}
                    label="Create a thank you notice for the referrer"
                    description={state.referrer.referrerId ? 'Waits in Referrer notices until someone sends it.' : 'Needs a referrer from the master list.'}
                  />
                </>
              ) : null}
            </div>
          </Panel>

          <Panel title="Patient">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" required error={errorFor('patient.firstName')} id="intake-firstName">
                  <Input
                    autoComplete="off"
                    value={state.patient.firstName}
                    onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, firstName: e.target.value } }))}
                    onBlur={() => touch('patient.firstName')}
                  />
                </Field>
                <Field label="Last name" required error={errorFor('patient.lastName')} id="intake-lastName">
                  <Input
                    autoComplete="off"
                    value={state.patient.lastName}
                    onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, lastName: e.target.value } }))}
                    onBlur={() => touch('patient.lastName')}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DatePicker
                  label="Date of birth"
                  value={state.patient.dob}
                  max={today}
                  onChange={(v) => update((s) => ({ ...s, patient: { ...s.patient, dob: v } }))}
                />
                <Field
                  label="Age group"
                  hint={state.patient.dob ? `Calculated as ${derived ? AGE_GROUP_LABELS[derived] : 'not set'}. Override only if the clinic says so.` : 'Enter a date of birth to calculate it.'}
                  id="intake-ageGroup"
                >
                  <Select
                    value={state.patient.ageOverride}
                    onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, ageOverride: e.target.value as IntakeState['patient']['ageOverride'] } }))}
                  >
                    <option value="derived">{derived ? `Use calculated (${derived})` : 'Use calculated'}</option>
                    <option value="A">Adult (A)</option>
                    <option value="Y">Youth (Y)</option>
                    <option value="C">Child (C)</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mobile or phone" hint="Coax #1 goes to this number." error={errorFor('patient.phone')} id="intake-phone">
                  <Input
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="0412 345 678"
                    value={state.patient.phone}
                    onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, phone: maskPhoneInput(e.target.value) } }))}
                    onBlur={() => touch('patient.phone')}
                  />
                </Field>
                <Field label="Email" error={errorFor('patient.email')} id="intake-email">
                  <Input
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={state.patient.email}
                    onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, email: e.target.value } }))}
                    onBlur={() => touch('patient.email')}
                  />
                </Field>
              </div>

              <Field label="Parent or guardian" hint="For a child or youth patient." id="intake-contact">
                <Input
                  autoComplete="off"
                  value={state.patient.contactPerson}
                  onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, contactPerson: e.target.value } }))}
                />
              </Field>

              <Field label="Address" id="intake-address">
                <Input
                  autoComplete="off"
                  value={state.patient.address}
                  onChange={(e) => update((s) => ({ ...s, patient: { ...s.patient, address: e.target.value } }))}
                />
              </Field>

              <DuplicateWarning
                candidate={{
                  firstName: state.patient.firstName,
                  lastName: state.patient.lastName,
                  dob: state.patient.dob,
                  phone: state.patient.phone,
                  receivedDate: state.receivedDate,
                }}
              />
            </div>
          </Panel>

          <Panel title="Preferences and flags">
            <div className="flex flex-col gap-5">
              {state.booking.enabled ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Clinic" id="intake-clinic" hint="Nearest to the patient matches the closest clinic.">
                  <Select
                    value={state.preferences.clinicId}
                    onChange={(e) => update((s) => ({ ...s, preferences: { ...s.preferences, clinicId: e.target.value } }))}
                  >
                    <option value="nearest">Nearest to patient</option>
                    {activeClinics.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Orthodontist" id="intake-ortho" hint="Next available is the earliest with any orthodontist.">
                  <Select
                    value={state.preferences.orthodontistId}
                    onChange={(e) => update((s) => ({ ...s, preferences: { ...s.preferences, orthodontistId: e.target.value } }))}
                  >
                    <option value="next_available">Next available</option>
                    {activeOrthos.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              )}

              <fieldset className="flex flex-col gap-4">
                <legend className="mb-1 text-sm font-medium text-ink">Flags</legend>
                {FLAG_OPTIONS.map((opt) => (
                  <Checkbox
                    key={opt.key}
                    label={opt.label}
                    description={opt.description}
                    checked={state.flags[opt.key]}
                    onCheckedChange={(v) => update((s) => ({ ...s, flags: { ...s.flags, [opt.key]: v } }))}
                  />
                ))}
              </fieldset>
              {state.flags.urgent ? (
                <Field label="Why is it urgent?" required error={errorFor('urgentReason')} id="intake-urgentReason" hint="Pain, trauma or a treatment that cannot wait. Recorded on the referral.">
                  <Textarea
                    rows={2}
                    value={state.urgentReason}
                    onChange={(e) => update((s) => ({ ...s, urgentReason: e.target.value }))}
                    onBlur={() => touch('urgentReason')}
                  />
                </Field>
              ) : null}
            </div>
          </Panel>

          <Panel title="Referrer">
            <ReferrerPicker
              value={state.referrer}
              onChange={(next) => update((s) => ({ ...s, referrer: next }))}
              errorFor={errorFor}
              touch={touch}
            />
          </Panel>

          {state.source && state.source !== 'ethos_online' && !state.booking.enabled ? (
            <Panel title="Missing information" description="Ticked items create a notice to the referrer asking for them. A blank mobile always counts.">
              <div className="flex flex-col gap-3">
                <Checkbox id="intake-missing-phone" label="Mobile number" checked={state.missing.phone} onCheckedChange={(v) => update((s) => ({ ...s, missing: { ...s.missing, phone: v } }))} />
                <Checkbox id="intake-missing-opg" label="OPG or x-rays" checked={state.missing.opg} onCheckedChange={(v) => update((s) => ({ ...s, missing: { ...s.missing, opg: v } }))} />
                <Checkbox id="intake-missing-letter" label="Referral letter" checked={state.missing.letter} onCheckedChange={(v) => update((s) => ({ ...s, missing: { ...s.missing, letter: v } }))} />
                {missingInfoItems(state).length > 0 ? (
                  <p className="text-sm text-ink-muted">The notice will ask for {listAnd(missingInfoItems(state))}.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Text to send" description={state.booking.enabled ? 'Not sent. The consult is already booked.' : 'Coax #1 goes out when you save.'}>
            {state.booking.enabled ? null : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-muted">
                To{' '}
                <span className="tabular font-medium text-ink">{state.patient.phone ? formatAuMobile(state.patient.phone) : 'no number yet'}</span>
              </p>
              <Field label="Template" id="intake-template">
                <Select value={state.templateKey} onChange={(e) => update((s) => ({ ...s, templateKey: e.target.value }))}>
                  {TEMPLATE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="rounded-control bg-canvas p-3 text-base leading-relaxed text-ink" aria-label="Message preview">
                {preview.body || 'Template not loaded.'}
              </div>
              {!state.patient.phone ? (
                <Badge tone="warning" icon="alert">
                  Not queued until a mobile number is added
                </Badge>
              ) : null}
            </div>
            )}
          </Panel>

          <Panel title="Attachments" description="X-rays, OPG or referral letter. 2 MB each.">
            <div className="flex flex-col gap-3">
              <Field label="Add files" id="intake-files" hint="PDF, JPEG or PNG. Prototype keeps the file name and size with the referral.">
                <Input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  multiple
                  className="h-auto py-2 file:mr-3 file:rounded-control file:border-0 file:bg-panel file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </Field>
              {fileNotice ? (
                <p role="status" className="text-sm text-warn-fg">
                  {fileNotice}
                </p>
              ) : null}
              {files.length > 0 ? (
                <ul className="flex flex-col gap-2" aria-label="Files to attach">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 rounded-control border border-line-subtle px-3 py-2">
                      <span className="min-w-0 truncate text-base">{f.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-sm text-ink-muted">{Math.max(1, Math.round(f.sizeBytes / 1024))} KB</span>
                        <IconButton icon="close" aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Panel>

          <Panel title="Comments and assignment">
            <div className="flex flex-col gap-4">
              <Field label="Comments" id="intake-comments">
                <Textarea
                  rows={4}
                  value={state.comments}
                  onChange={(e) => update((s) => ({ ...s, comments: e.target.value }))}
                />
              </Field>
              <Field label="Assign to" id="intake-assign">
                <Select value={state.assignedTo} onChange={(e) => update((s) => ({ ...s, assignedTo: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button type="submit" size="lg" loading={saving} icon="send" className="w-full">
              {state.booking.enabled ? 'Save as booked' : 'Save referral'}
            </Button>
            <p className="text-sm text-ink-muted">Ctrl+Enter also saves. Duplicates do not block a save.</p>
          </div>
        </div>
      </form>
    </>
  );
}

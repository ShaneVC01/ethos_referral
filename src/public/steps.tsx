import type { ReactNode } from 'react';
import { ageFromTypedDob, type FormState, type StepId, type UploadedFile } from './form';
import { maskDateInput, maskPhoneInput } from './format';
import { ATTACHMENT_KINDS, BRANCHES, MAX_FILES, NEXT_AVAILABLE_ORTHO, NEAREST_CLINIC, ORTHODONTISTS, type AttachmentKind } from './options';
import { CheckField, ChoiceGroup, FieldShell, PublicButton, SelectField, TextField, TextareaField } from './fields';

export interface StepProps {
  state: FormState;
  patch: (fn: (s: FormState) => FormState) => void;
  errorFor: (key: string) => string | undefined;
  touch: (key: string) => void;
}

/* ---------- 1. who is submitting ---------- */

export function WhoStep({ state, patch, errorFor, touch }: StepProps) {
  return (
    <ChoiceGroup
      name="submitter"
      legend="Who is sending this?"
      value={state.submitter}
      onChange={(value) => patch((s) => ({ ...s, submitter: value as FormState['submitter'] }))}
      onBlur={() => touch('submitter')}
      error={errorFor('submitter')}
      options={[
        {
          value: 'practice',
          label: 'A dentist or practice is referring a patient',
          description: 'You will add the practice details on the next step.',
        },
        {
          value: 'patient',
          label: 'I am the patient, or the parent or guardian',
          description: 'We will use your details to arrange the appointment.',
        },
      ]}
    />
  );
}

/* ---------- 2. patient ---------- */

export function PatientStep({ state, patch, errorFor, touch }: StepProps) {
  const p = state.patient;
  const setPatient = (key: keyof FormState['patient'], value: string) =>
    patch((s) => ({ ...s, patient: { ...s.patient, [key]: value } }));
  const age = ageFromTypedDob(p.dob);
  const under18 = age !== null && age < 18;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="patient-firstName"
          label="First name"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          value={p.firstName}
          onChange={(e) => setPatient('firstName', e.target.value)}
          onBlur={() => touch('patient.firstName')}
          error={errorFor('patient.firstName')}
        />
        <TextField
          id="patient-lastName"
          label="Last name"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          value={p.lastName}
          onChange={(e) => setPatient('lastName', e.target.value)}
          onBlur={() => touch('patient.lastName')}
          error={errorFor('patient.lastName')}
        />
      </div>

      <TextField
        id="patient-dob"
        label="Date of birth"
        hint="For example 04/11/2014."
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        value={p.dob}
        onChange={(e) => setPatient('dob', maskDateInput(e.target.value))}
        onBlur={() => touch('patient.dob')}
        error={errorFor('patient.dob')}
      />

      {under18 || p.guardianName ? (
        <TextField
          id="patient-guardianName"
          label="Parent or guardian name"
          hint="Needed because the patient is under 18."
          autoComplete="name"
          value={p.guardianName}
          onChange={(e) => setPatient('guardianName', e.target.value)}
          onBlur={() => touch('patient.guardianName')}
          error={errorFor('patient.guardianName')}
        />
      ) : null}

      <TextField
        id="patient-mobile"
        label="Mobile number"
        hint="We text the patient from this number. Use the mobile that gets messages best."
        inputMode="tel"
        autoComplete="tel"
        placeholder="04xx xxx xxx"
        maxLength={12}
        value={p.mobile}
        onChange={(e) => setPatient('mobile', maskPhoneInput(e.target.value))}
        onBlur={() => touch('patient.mobile')}
        error={errorFor('patient.mobile')}
      />

      <TextField
        id="patient-email"
        label="Email address"
        optional
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        value={p.email}
        onChange={(e) => setPatient('email', e.target.value)}
        onBlur={() => touch('patient.email')}
        error={errorFor('patient.email')}
      />

      <fieldset className="flex flex-col gap-5 border-t border-line-subtle pt-6">
        <legend className="mb-2 text-base font-semibold text-ink">Home address</legend>
        <TextField
          id="patient-street"
          label="Street address"
          autoComplete="address-line1"
          value={p.street}
          onChange={(e) => setPatient('street', e.target.value)}
          onBlur={() => touch('patient.street')}
          error={errorFor('patient.street')}
        />
        <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
          <TextField
            id="patient-suburb"
            label="Suburb"
            autoComplete="address-level2"
            value={p.suburb}
            onChange={(e) => setPatient('suburb', e.target.value)}
            onBlur={() => touch('patient.suburb')}
            error={errorFor('patient.suburb')}
          />
          <TextField
            id="patient-postcode"
            label="Postcode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={4}
            value={p.postcode}
            onChange={(e) => setPatient('postcode', e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => touch('patient.postcode')}
            error={errorFor('patient.postcode')}
          />
        </div>
      </fieldset>
    </div>
  );
}

/* ---------- 3. preferences ---------- */

export function PreferencesStep({ state, patch, errorFor, touch }: StepProps) {
  const pr = state.preferences;
  const setPref = <K extends keyof FormState['preferences']>(key: K, value: FormState['preferences'][K]) =>
    patch((s) => ({ ...s, preferences: { ...s.preferences, [key]: value } }));

  return (
    <div className="flex flex-col gap-6">
      <SelectField
        id="pref-clinic"
        label="Clinic"
        hint="Not sure? Choose nearest to the patient and we will match the closest clinic."
        value={pr.clinicId}
        onChange={(e) => setPref('clinicId', e.target.value)}
      >
        <option value={NEAREST_CLINIC}>Nearest to the patient</option>
        {BRANCHES.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        id="pref-ortho"
        label="Orthodontist"
        hint="Choose next available for the earliest appointment with any orthodontist."
        value={pr.orthodontistId}
        onChange={(e) => setPref('orthodontistId', e.target.value)}
      >
        <option value={NEXT_AVAILABLE_ORTHO}>Next available</option>
        {ORTHODONTISTS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>

      <fieldset className="flex flex-col gap-5 border-t border-line-subtle pt-6">
        <legend className="mb-2 text-base font-semibold text-ink">Special requests</legend>

        <CheckField
          id="pref-interpreter"
          checked={pr.needsInterpreter}
          onChange={(v) => setPref('needsInterpreter', v)}
          label="The patient or parent needs an interpreter"
          description="Tell us the language and we will arrange an interpreter."
        />
        {pr.needsInterpreter ? (
          <TextField
            id="pref-interpreterLanguage"
            label="Language"
            autoComplete="off"
            value={pr.interpreterLanguage}
            onChange={(e) => setPref('interpreterLanguage', e.target.value)}
            onBlur={() => touch('preferences.interpreterLanguage')}
            error={errorFor('preferences.interpreterLanguage')}
          />
        ) : null}

        <CheckField
          id="pref-female"
          checked={pr.femaleOrthodontist}
          onChange={(v) => setPref('femaleOrthodontist', v)}
          label="Request a female orthodontist"
          description="We will try to match this, but it cannot always be guaranteed."
        />

        <CheckField
          id="pref-urgent"
          checked={pr.isUrgent}
          onChange={(v) => setPref('isUrgent', v)}
          label="This referral is urgent"
          description="For example, pain, trauma or a treatment that cannot wait."
        />
        {pr.isUrgent ? (
          <TextareaField
            id="pref-urgentReason"
            label="Why is it urgent?"
            rows={3}
            value={pr.urgentReason}
            onChange={(e) => setPref('urgentReason', e.target.value)}
            onBlur={() => touch('preferences.urgentReason')}
            error={errorFor('preferences.urgentReason')}
          />
        ) : null}
      </fieldset>

      <TextareaField
        id="pref-comments"
        label="Anything else we should know?"
        optional
        rows={4}
        maxLength={1000}
        value={pr.comments}
        onChange={(e) => setPref('comments', e.target.value)}
        onBlur={() => touch('preferences.comments')}
        error={errorFor('preferences.comments')}
      />
      <p className="-mt-4 text-right text-sm tabular text-ink-muted" aria-live="polite">
        {pr.comments.length} of 1,000
      </p>
    </div>
  );
}

/* ---------- 4. referring practice (practice path only) ---------- */

export function ReferrerStep({ state, patch, errorFor, touch }: StepProps) {
  const r = state.referrer;
  const setRef = (key: keyof FormState['referrer'], value: string) => patch((s) => ({ ...s, referrer: { ...s.referrer, [key]: value } }));
  return (
    <div className="flex flex-col gap-5">
      <TextField
        id="ref-practiceName"
        label="Practice or dentist name"
        hint="For example, Smith Dental or Dr Jane Smith."
        autoComplete="organization"
        value={r.practiceName}
        onChange={(e) => setRef('practiceName', e.target.value)}
        onBlur={() => touch('referrer.practiceName')}
        error={errorFor('referrer.practiceName')}
      />
      <TextField
        id="ref-phone"
        label="Practice phone"
        inputMode="tel"
        autoComplete="tel"
        placeholder="07 xxxx xxxx"
        maxLength={12}
        value={r.phone}
        onChange={(e) => setRef('phone', maskPhoneInput(e.target.value))}
        onBlur={() => touch('referrer.phone')}
        error={errorFor('referrer.phone')}
      />
      <TextField
        id="ref-email"
        label="Practice email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        value={r.email}
        onChange={(e) => setRef('email', e.target.value)}
        onBlur={() => touch('referrer.email')}
        error={errorFor('referrer.email')}
      />
      <TextField
        id="ref-address"
        label="Practice address"
        autoComplete="street-address"
        value={r.address}
        onChange={(e) => setRef('address', e.target.value)}
        onBlur={() => touch('referrer.address')}
        error={errorFor('referrer.address')}
      />
    </div>
  );
}

/* ---------- 5. files and consent ---------- */

export interface AttachmentStepProps extends StepProps {
  files: UploadedFile[];
  onAddFiles: (list: FileList) => void;
  onRemoveFile: (id: string) => void;
  onKindChange: (id: string, kind: AttachmentKind) => void;
}

export function AttachmentStep({ state, patch, errorFor, touch, files, onAddFiles, onRemoveFile, onKindChange }: AttachmentStepProps) {
  const fullUp = files.length >= MAX_FILES;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <FieldShell
          id="files-input"
          label="X-rays, OPG or referral letter"
          optional
          hint={`PDF, JPEG or PNG. Up to 2 MB each, and up to ${MAX_FILES} files. Attaching them saves a call back.`}
        >
          <input
            id="files-input"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            disabled={fullUp}
            aria-describedby="files-input-hint"
            className="min-h-12 w-full rounded-control border border-line bg-surface py-2 text-base text-ink file:mr-3 file:rounded-control file:border-0 file:bg-panel file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink disabled:text-ink-disabled"
            onChange={(e) => {
              if (e.target.files?.length) onAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </FieldShell>
        {files.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Files added">
            {files.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-ink">{f.fileName}</p>
                    <p className="tabular text-sm text-ink-muted">{formatSize(f.sizeBytes)}</p>
                  </div>
                  <PublicButton variant="text" onClick={() => onRemoveFile(f.id)} aria-label={`Remove ${f.fileName}`}>
                    Remove
                  </PublicButton>
                </div>
                {f.status === 'reading' ? (
                  <div className="flex flex-col gap-1">
                    <div
                      role="progressbar"
                      aria-label={`Checking ${f.fileName}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={f.progress}
                      className="h-1.5 overflow-hidden rounded-pill bg-line-subtle"
                    >
                      <div className="h-full bg-accent transition-[width] duration-[var(--duration-fast)]" style={{ width: `${f.progress}%` }} />
                    </div>
                    <p className="text-sm text-ink-muted">Checking the file, {f.progress}%</p>
                  </div>
                ) : null}
                {f.status === 'error' ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {f.error}
                  </p>
                ) : null}
                {f.status === 'ready' ? (
                  <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
                    What is this file?
                    <select
                      value={f.kind}
                      onChange={(e) => onKindChange(f.id, e.target.value as AttachmentKind)}
                      className="h-11 rounded-control border border-line bg-surface px-3 text-base text-ink hover:border-line-strong"
                    >
                      {ATTACHMENT_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-5 border-t border-line-subtle pt-6">
        <CheckField
          id="consent"
          checked={state.consent}
          onChange={(v) => patch((s) => ({ ...s, consent: v }))}
          onBlur={() => touch('consent')}
          label="The patient or their parent or guardian agrees to Ethos Orthodontics contacting them about this referral by text message and phone."
          description="We use these details only to arrange this referral, and we do not share them for marketing."
          error={errorFor('consent')}
        />

        <div className="flex flex-col gap-2 rounded-panel border border-line bg-canvas p-4">
          <p className="text-base font-semibold text-ink">Quick security check</p>
          <CheckField
            id="security-check"
            checked={state.securityCheck}
            onChange={(v) => patch((s) => ({ ...s, securityCheck: v }))}
            onBlur={() => touch('securityCheck')}
            label="I am a person, not an automated system"
            error={errorFor('securityCheck')}
          />
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ---------- 6. review ---------- */

function ReviewSection({ title, onChange, children }: { title: string; onChange: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line-subtle pb-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <PublicButton variant="text" onClick={onChange} aria-label={`Change ${title.toLowerCase()}`}>
          Change
        </PublicButton>
      </div>
      <dl className="grid gap-x-5 gap-y-2 text-base sm:grid-cols-[10rem_1fr]">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value || 'Not given'}</dd>
    </>
  );
}

export function ReviewStep({ state, files, goTo, submitter }: { state: FormState; files: UploadedFile[]; goTo: (step: StepId) => void; submitter: 'practice' | 'patient' | null }) {
  const p = state.patient;
  const pr = state.preferences;
  const clinic = BRANCHES.find((b) => b.id === pr.clinicId)?.name ?? 'Nearest to the patient';
  const ortho = ORTHODONTISTS.find((o) => o.id === pr.orthodontistId)?.name ?? 'Next available';
  const ready = files.filter((f) => f.status === 'ready');

  return (
    <div className="flex flex-col gap-5">
      <ReviewSection title="Who is sending" onChange={() => goTo('who')}>
        <Row label="Sender" value={submitter === 'practice' ? 'Dentist or practice' : 'Patient or parent'} />
      </ReviewSection>

      <ReviewSection title="Patient" onChange={() => goTo('patient')}>
        <Row label="Name" value={`${p.firstName} ${p.lastName}`.trim()} />
        <Row label="Date of birth" value={p.dob} />
        {p.guardianName ? <Row label="Parent or guardian" value={p.guardianName} /> : null}
        <Row label="Mobile" value={p.mobile} />
        <Row label="Email" value={p.email} />
        <Row label="Address" value={[p.street, p.suburb, p.postcode].filter(Boolean).join(', ')} />
      </ReviewSection>

      <ReviewSection title="Preferences" onChange={() => goTo('preferences')}>
        <Row label="Clinic" value={clinic} />
        <Row label="Orthodontist" value={ortho} />
        <Row label="Interpreter" value={pr.needsInterpreter ? pr.interpreterLanguage : 'No'} />
        <Row label="Female orthodontist" value={pr.femaleOrthodontist ? 'Requested' : 'No'} />
        <Row label="Urgent" value={pr.isUrgent ? pr.urgentReason : 'No'} />
        {pr.comments.trim() ? <Row label="Comments" value={pr.comments} /> : null}
      </ReviewSection>

      {submitter === 'practice' ? (
        <ReviewSection title="Practice" onChange={() => goTo('referrer')}>
          <Row label="Practice" value={state.referrer.practiceName} />
          <Row label="Phone" value={state.referrer.phone} />
          <Row label="Email" value={state.referrer.email} />
          <Row label="Address" value={state.referrer.address} />
        </ReviewSection>
      ) : null}

      <ReviewSection title="Files" onChange={() => goTo('attachments')}>
        <Row
          label="Attached"
          value={ready.length ? ready.map((f) => `${f.fileName} (${ATTACHMENT_KINDS.find((k) => k.value === f.kind)?.label ?? 'Other'})`).join('; ') : 'No files'}
        />
      </ReviewSection>
    </div>
  );
}


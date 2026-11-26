import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { ZodError } from 'zod';
import { buildPayload, EMPTY_FORM, firstInvalidStep, STEP_LABELS, stepsFor, validateStep, type FormState, type StepId, type UploadedFile } from './form';
import { clearDraft, loadDraft, saveDraft } from './draft';
import { submitPublicReferral } from './submitPublicReferral';
import { MAX_FILE_BYTES, MAX_FILES, type AttachmentKind } from './options';
import { AttachmentStep, PatientStep, PreferencesStep, ReferrerStep, ReviewStep, WhoStep, type StepProps } from './steps';
import { PublicButton } from './fields';

const HEADINGS: Record<StepId, string> = {
  who: 'who is submitting',
  patient: 'the patient',
  preferences: 'appointment preferences',
  referrer: 'the referring practice',
  attachments: 'files and consent',
  review: 'check and send',
};

/** Maps a validation key to the id of the control that should take focus. */
const FIELD_IDS: Record<string, string> = {
  submitter: 'submitter-practice',
  'patient.firstName': 'patient-firstName',
  'patient.lastName': 'patient-lastName',
  'patient.dob': 'patient-dob',
  'patient.guardianName': 'patient-guardianName',
  'patient.mobile': 'patient-mobile',
  'patient.email': 'patient-email',
  'patient.street': 'patient-street',
  'patient.suburb': 'patient-suburb',
  'patient.postcode': 'patient-postcode',
  'preferences.interpreterLanguage': 'pref-interpreterLanguage',
  'preferences.urgentReason': 'pref-urgentReason',
  'preferences.comments': 'pref-comments',
  'referrer.practiceName': 'ref-practiceName',
  'referrer.phone': 'ref-phone',
  'referrer.email': 'ref-email',
  'referrer.address': 'ref-address',
  consent: 'consent',
  securityCheck: 'security-check',
};

function focusField(key: string | undefined) {
  if (!key) return;
  window.setTimeout(() => document.getElementById(FIELD_IDS[key] ?? key)?.focus(), 0);
}

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;

function newFileId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The public referral form. Six steps for a practice, five for a patient. Anonymous, no data
 * echoed back after sending, drafts kept on this device and cleared on send.
 */
export function ReferForm() {
  const [initial] = useState(() => {
    const draft = loadDraft();
    return { state: draft ?? EMPTY_FORM, restored: draft !== null };
  });
  const [state, setState] = useState<FormState>(initial.state);
  const [restored, setRestored] = useState(initial.restored);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  const steps = stepsFor(state.submitter);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index] ?? 'who';
  const errors = validateStep(step, state);
  const errorFor = (key: string) => (touched[key] || attempted ? errors[key] : undefined);
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }));

  // Autosave the draft on this device. Nothing is written after the form has been sent.
  useEffect(() => {
    if (!reference) saveDraft(state);
  }, [state, reference]);

  // Move focus to the new step heading so screen reader and keyboard users land at the top of it.
  // Skipped on the first render so the page does not jump on load.
  const stepMounted = useRef(false);
  useEffect(() => {
    if (!stepMounted.current) {
      stepMounted.current = true;
      return;
    }
    if (!reference) headingRef.current?.focus();
  }, [index, reference]);

  useEffect(() => {
    if (reference) confirmRef.current?.focus();
  }, [reference]);

  const patch: StepProps['patch'] = (fn) => setState((s) => fn(s));

  function goBack() {
    setAttempted(false);
    setStepIndex(Math.max(0, index - 1));
    window.scrollTo({ top: 0 });
  }

  function goTo(target: StepId) {
    setAttempted(false);
    setStepIndex(Math.max(0, steps.indexOf(target)));
    window.scrollTo({ top: 0 });
  }

  function continueForward() {
    const found = validateStep(step, state);
    const keys = Object.keys(found);
    if (keys.length > 0) {
      setAttempted(true);
      focusField(keys[0]);
      return;
    }
    setAttempted(false);
    setStepIndex(Math.min(steps.length - 1, index + 1));
    window.scrollTo({ top: 0 });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 'review') void send();
    else continueForward();
  }

  function addFiles(list: FileList) {
    const room = MAX_FILES - files.length;
    const picked = Array.from(list);
    if (picked.length > room) {
      setFileNotice(`You can add up to ${MAX_FILES} files. ${picked.length - Math.max(room, 0)} were not added.`);
    } else {
      setFileNotice(null);
    }
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const id = newFileId();
      const typeOk = (ACCEPTED_MIME as readonly string[]).includes(file.type);
      const sizeOk = file.size <= MAX_FILE_BYTES;
      const base: UploadedFile = {
        id,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: typeOk ? (file.type as UploadedFile['mimeType']) : 'application/pdf',
        kind: 'referral_letter',
        status: 'reading',
        progress: 0,
        error: null,
      };
      if (!typeOk) {
        setFiles((f) => [...f, { ...base, status: 'error', error: `Use a PDF, JPEG or PNG file. ${file.name} was not added.` }]);
        continue;
      }
      if (!sizeOk) {
        setFiles((f) => [...f, { ...base, status: 'error', error: 'This file is larger than 2 MB. Save a smaller copy and add it again.' }]);
        continue;
      }
      setFiles((f) => [...f, base]);
      const reader = new FileReader();
      reader.onprogress = (ev) => {
        const progress = ev.lengthComputable && ev.total > 0 ? Math.round((ev.loaded / ev.total) * 100) : 100;
        setFiles((list2) => list2.map((x) => (x.id === id ? { ...x, progress } : x)));
      };
      reader.onload = () => setFiles((list2) => list2.map((x) => (x.id === id ? { ...x, status: 'ready', progress: 100 } : x)));
      reader.onerror = () =>
        setFiles((list2) =>
          list2.map((x) => (x.id === id ? { ...x, status: 'error', error: 'We could not read this file. Save it again and add it.' } : x)),
        );
      reader.readAsArrayBuffer(file);
    }
  }

  function removeFile(id: string) {
    setFiles((f) => f.filter((x) => x.id !== id));
  }

  function setFileKind(id: string, kind: AttachmentKind) {
    setFiles((f) => f.map((x) => (x.id === id ? { ...x, kind } : x)));
  }

  async function send() {
    const invalid = firstInvalidStep(state);
    if (invalid) {
      setStepIndex(Math.max(0, steps.indexOf(invalid)));
      setAttempted(true);
      const firstKey = Object.keys(validateStep(invalid, state))[0];
      focusField(firstKey);
      return;
    }
    if (files.some((f) => f.status === 'reading')) {
      setSendError('Wait for the files to finish checking, then send the referral.');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const payload = buildPayload(state, files);
      const result = await submitPublicReferral(payload);
      clearDraft();
      setReference(result.reference);
    } catch (err) {
      if (err instanceof ZodError) {
        setSendError('Some details need checking. Go back through the steps and check each one.');
      } else {
        setSendError(err instanceof Error ? err.message : 'We could not send your referral. Your details are still here. Try again.');
      }
    } finally {
      setSending(false);
    }
  }

  function startAgain() {
    clearDraft();
    setState(EMPTY_FORM);
    setFiles([]);
    setFileNotice(null);
    setTouched({});
    setAttempted(false);
    setSendError(null);
    setRestored(false);
    setStepIndex(0);
    setReference(null);
  }

  if (reference) {
    return (
      <Confirmation reference={reference} headingRef={confirmRef} onAgain={startAgain} />
    );
  }

  const stepProps: StepProps = { state, patch, errorFor, touch };
  const errorCount = Object.keys(errors).length;

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="refer-title" className="flex flex-col">
      <h1 id="refer-title" className="public-title">
        refer a patient
      </h1>
      <p className="public-lede">
        Send a referral for a patient or request an appointment. It takes about three minutes. Your progress is saved on this device until you send the form.
      </p>

      {restored ? (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-panel bg-accent-subtle px-4 py-3 text-sm text-ink">
          <span>We kept your progress from earlier.</span>
          <PublicButton variant="text" onClick={startAgain} className="text-sm">
            Start again
          </PublicButton>
        </div>
      ) : null}

      <nav aria-label="Form progress" className="mt-8">
        <p className="text-sm font-medium text-ink-muted">
          Step {index + 1} of {steps.length}, {STEP_LABELS[step].toLowerCase()}
        </p>
        <ol className="mt-2 flex gap-1.5">
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={i === index ? 'step' : undefined}
              className={`h-1.5 flex-1 rounded-pill ${i <= index ? 'bg-accent' : 'bg-line-subtle'}`}
            >
              <span className="sr-only">
                {STEP_LABELS[s]}
                {i < index ? ', done' : ''}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="step-title" className="mt-10 flex flex-col gap-6">
        <h2 id="step-title" ref={headingRef} tabIndex={-1} className="font-brand text-[1.6rem] font-light lowercase leading-tight text-ink outline-none">
          {HEADINGS[step]}
        </h2>

        {attempted && errorCount > 0 ? (
          <p role="alert" className="rounded-panel bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            Check the highlighted {errorCount === 1 ? 'field' : 'fields'} before you continue.
          </p>
        ) : null}

        {step === 'who' ? <WhoStep {...stepProps} /> : null}
        {step === 'patient' ? <PatientStep {...stepProps} /> : null}
        {step === 'preferences' ? <PreferencesStep {...stepProps} /> : null}
        {step === 'referrer' ? <ReferrerStep {...stepProps} /> : null}
        {step === 'attachments' ? (
          <>
            <AttachmentStep
              {...stepProps}
              files={files}
              onAddFiles={addFiles}
              onRemoveFile={removeFile}
              onKindChange={setFileKind}
            />
            {fileNotice ? (
              <p role="status" className="text-sm text-ink-muted">
                {fileNotice}
              </p>
            ) : null}
          </>
        ) : null}
        {step === 'review' ? <ReviewStep state={state} files={files} goTo={goTo} submitter={state.submitter} /> : null}

        {sendError ? (
          <p role="alert" className="rounded-panel bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {sendError}
          </p>
        ) : null}
      </section>

      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
        {index > 0 ? (
          <PublicButton variant="secondary" onClick={goBack} className="w-full sm:w-auto">
            Back
          </PublicButton>
        ) : (
          <span />
        )}
        {step === 'review' ? (
          <PublicButton type="submit" loading={sending} className="w-full sm:w-auto">
            Send referral
          </PublicButton>
        ) : (
          <PublicButton type="submit" className="w-full sm:w-auto">
            Continue
          </PublicButton>
        )}
      </div>

      <p className="mt-12 text-sm leading-relaxed text-ink-muted">
        We use your details only to arrange this referral. Nothing is shared for marketing.
      </p>
    </form>
  );
}

function Confirmation({
  reference,
  headingRef,
  onAgain,
}: {
  reference: string;
  headingRef: RefObject<HTMLHeadingElement>;
  onAgain: () => void;
}) {
  return (
    <section aria-labelledby="done-title" className="flex flex-col gap-6">
      <h1 id="done-title" ref={headingRef} tabIndex={-1} className="public-title outline-none">
        thank you, we have your referral
      </h1>
      <p className="public-lede">
        Your reference is <span className="tabular font-semibold text-ink">{reference}</span>. Keep it for your records.
      </p>
      <div className="rounded-panel border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">What happens next</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-base leading-relaxed text-ink">
          <li>We'll text the patient within one business day.</li>
          <li>If we cannot reach them by text, we will call.</li>
          <li>The patient can reply to the text or call the clinic to book.</li>
        </ol>
      </div>
      <PublicButton variant="secondary" onClick={onAgain} className="self-start">
        Refer another patient
      </PublicButton>
    </section>
  );
}

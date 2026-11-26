# Product

<!-- impeccable:product-schema 1 -->

## Platform (web)

Web application, responsive from 360px phones to 1440px desktops. Two surfaces:

- **Staff app** (`index.html`, named "Ethos Referrals"): internal, installable as a PWA, behind a secured internal URL (Cloudflare Access planned).
- **Public referral form** (`refer.html`): anonymous, separate bundle with no app code, no data and no service worker.

Hosting: Cloudflare Pages (planned). Data layer: an in-memory mock adapter for the prototype, with a repository interface so Supabase can replace it without UI change.

## Stack

- Vite, React 18, TypeScript (strict), React Router v6 (data router), TanStack Query, TanStack Table and TanStack Virtual.
- Tailwind CSS v4 with design tokens as CSS variables. shadcn-style components on Radix primitives. Lucide icons.
- react-hook-form with zod. date-fns (en-AU, Australia/Brisbane). Recharts for dashboard charts.
- vite-plugin-pwa (prompt-to-update service worker), cmdk for the command palette, sonner for toasts.
- Fonts from @fontsource: Figtree (staff app), Montserrat and Quicksand (public form).
- Later: Supabase (Postgres, Auth, Storage, Edge Functions), Coax SMS, Cloudflare Turnstile on the public form.

## Users

- **Referrals manager:** oversees the queue, runs reports (dashboard), imports the tracker, maintains settings (cadence, templates, clinics, orthodontists, staff). Desk PC user.
- **Referral agents:** work the daily queue of calls and texts, log outcomes, record bookings with the Edge patient ID, and close referrals. Desk PC and phone user.
- **Public submitters:** dentists referring a patient, and patients or parents requesting an appointment. Anonymous, mostly on phones, possibly on first visit.

## Usage scene

- Agents work for long sessions at a desk PC with a large monitor, with the queue on one side and Edge and Coax open beside it. Keyboard use is common.
- Agents also use a phone on the move to log outcomes and reply to texts.
- No dedicated tablet scene, but tablet layouts must still work.
- Clinic reception environments are shared, so screens may be left open. Sessions must lock when idle.

## Product Purpose

Replace the 2026 Excel referral tracker (one tab per month) with a system for the core referral flow:

1. Referral received (website form, email, phone, handwritten scan or external portal).
2. Cadence of contacts by Coax SMS and phone until the patient books or the referral closes.
3. Booked (recorded against an Edge patient ID) or closed (unsuccessful, declined, do not contact or returned to the referrer).

Edge remains the patient system of record. Admin tasks in the team process document (specialist letters, PDrive and Teams filing, Write Ups folder) are out of scope.

## Positioning

- An operational tool for a small clinical team, not a marketing or CRM product.
- Replaces manual typing and spreadsheet chasing with a queue that shows the next action and its due date.
- Replaces the website referral form with a form that feeds the system directly.
- Familiar and restrained. The tool should disappear into the task.

## Operating Context

- Australian clinic network: 13 clinics across South East Queensland, Townsville and Noosa (codes in the Master List).
- About 20 orthodontists over time, a weekday roster per clinic, and a referrer master of about 2,900 professionals (dentists, specialists, GPs and patients who refer).
- Volumes: about 4,265 referral rows across the 2026 tracker, plus 18,262 Edge referral history rows.
- Patient data is sensitive health information. Minimise what is shown, and never put it in URLs, page titles or browser history.
- Australian formats throughout: DD/MM/YYYY dates, 04xx xxx xxx mobiles, 4-digit postcodes.

## Capabilities and Constraints

Capabilities in the prototype:

- Mock sign-in with a staff picker and a Manager or Agent role switch. Role-based navigation and route guards.
- Referral queue (Today), referrals table with search and filters, referral detail with a step tracker and timeline.
- Logging contact outcomes, sending Coax SMS from templates, handling failed texts and inbound replies.
- Manual referral intake with a referrer typeahead over the referrer master and a live duplicate check.
- Public referral form with draft autosave and a reference number on submit.
- Referrer directory and profile with Edge history.
- Manager dashboard (KPIs, funnel, splits, overdue work, staff workload, SMS failure rate).
- Idempotent import of the tracker files with a preview, row results, commit and rollback in mock mode.
- Settings for cadence offsets, SMS templates, clinics, orthodontists, roster, staff and a demo clock.
- Installable PWA with an offline banner. No offline writes.

Constraints:

- The app must work at 360px to 1440px in light and dark modes, with keyboard-only operation on desktop.
- The cadence follows the team process: Day 0 Coax #1, Day 1 call then Coax #2, Day 14 call then Coax #3, 3 months final call then Coax #4 and advise the referrer. Managers can change offsets.
- Duplicate referrals (the same patient copied into a later month) must merge. Re-importing a file creates no new rows.
- No emoji in the UI. Australian English. Sentence case in the staff app.

## Brand Commitments

- The Ethos wordmark (grey `#8F959A` "ethos orthodontics") appears in the staff app header and login.
- Staff app palette: logo grey neutrals and sage `#4F7366` only. Sage is used for primary actions, current selection, focus and progress. Never decorative.
- The public form matches the Ethos website: Montserrat light lowercase headings, Quicksand body and labels, sage accent, generous whitespace, the same tone of voice.
- Tone: plain, calm, clinical and respectful. Short sentences. No slang or marketing language.

## Evidence on Hand

- Source files in the client folder: 2026 Dentist referrals tracker (12 month tabs, two header layouts, shifted rows, mixed date formats, phone tags), the Referrer Master workbook, the Master List of Orthodontists and Clinics (clinics, aliases, orthodontists, roster) and the team process document.
- Status values in the tracker: Booked, To call us, DNC and blank. Outcome values: LM and Coax sent, Called and booked, Spoke with Pt/Parent, Booked via CC, Coax sent and Emailed.
- Codes in the tracker: age group A, Y and C. Location codes, orthodontist codes and staff initials, with aliases.
- Current practice is manual: one tab per month, a Totals tab and a manual cadence. Pain points are the repeated retyping, the lack of a single next action, and the risk of a missed contact.
- Unconfirmed items (see the seed lookups): age group thresholds, guessed orthodontist codes, staff names and roles, and the wording of SMS templates.

## Product Principles

1. The next action is always obvious. Each referral states its next step and due date in words.
2. Patient data is shown only where the task needs it. Lists mask phone numbers until a row is opened.
3. Edge stays the system of record. Bookings are captured with the Edge patient ID, and the app never pretends to book.
4. Nothing gets lost between contacts. Every change is attributed and timestamped, and the cadence keeps running.

## Accessibility and Inclusion

- Target WCAG 2.2 AA as the craft floor. No formal certification is required at this stage.
- Text contrast at least 4.5:1 and large text at least 3:1, verified in light and dark modes.
- Status is always shown with an icon and a label, never colour alone.
- Full keyboard operation on desktop: j and k to move through lists, Enter to open, n for a new referral, Ctrl+K for the command palette.
- Touch targets at least 44px on phones. Labels visible on every field, with errors that say what is wrong and how to fix it.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`. Honour phone safe-area insets.
- Public form: one column, short steps, correct `inputmode` and `autocomplete` attributes, and no data echoed back after submit beyond the reference number.

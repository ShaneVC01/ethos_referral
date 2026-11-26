# Design system: Ethos Referrals

Single source of truth for every screen. Feature agents follow this file. Values here match `src/styles/tokens.css`, and where they differ, tokens.css wins and this file must be updated.

Mode: **Operate** (staff app) and **Operate with brand presence** (public form). See `PRODUCT.md` for users and scenes.

## 1. Direction

- Clinical, calm and restrained. Scanability, density and consistency outrank expression.
- Neutrals are tinted slightly cool toward the logo grey `#8F959A`. Teal `#0F7A6A` (palette v2) is the only accent, on a dark teal top bar `#1F4A4A`.
- Brand lives in precise details: the wordmark in its white chip, teal focus rings, teal selection and progress, and the grey neutrals.
- No gradients, glass, decorative illustration, emoji, or display fonts in labels, buttons or data.
- Borders define most surfaces inside the app. Work screens (Today, Referrals) may use soft cards: white cards on the light canvas, 12 to 16px radius and the gentle `shadow-card` (section 10.2). Overlays use `shadow-overlay`.
- Light and dark are designed together, not inverted. Dark follows the OS (`prefers-color-scheme`) unless `[data-theme]` is set.

## 2. Colour tokens

**Palette v2 (teal) is live.** Values in `src/styles/tokens.css` win. The table below is the v2 summary, checked for contrast:

| Role | Light | Dark | Contrast (light) |
|---|---|---|---|
| App top bar (`bar`) | `#1F4A4A` | `#123231` | 9.8:1 with white text |
| Primary, selection, focus (`accent`) | `#0F7A6A` | `#5CC2AE` | 5.2:1 with white text |
| Mint tint (`accent-subtle`) | `#DDF3EE` | `#173B36` | teal text on mint 4.5:1 |
| Current progress, today (`amber`, `warn`) | `#B7791F` (segment), `#8A5A00` (text) | `#E8B04A`, `#F2C15A` | text 5.9:1 |
| Overdue, failed, do not contact (`danger`, `danger-bg`) | `#B42318` on `#FDE8E6` | `#FF8A7F` | 5.6:1 on the tint |
| Done (`ok`, `ok-bg`) | `#1E7F55` on `#E3F4EC` | `#6FC39A` | 4.9:1 |

The Ethos grey wordmark sits in a white chip on the dark top bar, so the logo keeps its own colours.

### 2.1 Light (default)

| Token | Utility | OKLCH | Hex | Use | Contrast |
|---|---|---|---|---|---|
| `--color-canvas` | `bg-canvas` | oklch(0.970 0.002 247.8) | #F4F5F6 | App background | base |
| `--color-surface` | `bg-surface` | oklch(1 0 0) | #FFFFFF | Cards, tables, inputs, sheets | base |
| `--color-panel` | `bg-panel` | oklch(0.951 0.003 228.8) | #EDEFF0 | Sidebar, rail, bottom nav, table header | base |
| `--color-line` | `border-line` | oklch(0.902 0.005 247.9) | #DCDFE2 | Default hairline | 1.34:1 (decorative) |
| `--color-line-subtle` | `border-line-subtle` | oklch(0.930 0.003 247.9) | #E6E8EA | Row dividers | decorative |
| `--color-line-strong` | `border-line-strong` | oklch(0.666 0.010 242.9) | #8F959A | Checkbox and radio borders, strong edges | 3.03:1 on white (non-text, 3:1 target) |
| `--color-ink` | `text-ink` | oklch(0.321 0.009 233.9) | #2F3437 | Primary text | 12.6:1 on white |
| `--color-ink-muted` | `text-ink-muted` | oklch(0.491 0.013 235.0) | #5A6267 | Secondary text, helper text | 6.2:1 on white, 5.7:1 on canvas |
| `--color-ink-subtle` | `text-ink-subtle` | oklch(0.550 0.012 235.0) | #6B7378 | Placeholder and hints | 4.8:1 on white |
| `--color-ink-disabled` | `text-ink-disabled` | oklch(0.650 0.010 242.9) | #8A9095 | Disabled text only | exempt (disabled) |
| `--color-accent` | `bg-accent`, `text-accent` | oklch(0.524 0.046 170.0) | #4F7366 | Primary action, selection, progress | 5.3:1 on white |
| `--color-accent-hover` | `bg-accent-hover` | oklch(0.468 0.041 168.5) | #436256 | Hover on primary | 6.7:1 |
| `--color-accent-active` | `bg-accent-active` | oklch(0.382 0.029 161.7) | #35483E | Pressed primary | 9.8:1 |
| `--color-accent-subtle` | `bg-accent-subtle` | oklch(0.930 0.014 169.2) | #DFEBE6 | Selected row, current nav item | text on it: ink |
| `--color-accent-fg` | `text-accent-fg` | oklch(1 0 0) | #FFFFFF | Text on accent | 5.3:1 |
| `--color-focus` | `outline-focus` | oklch(0.524 0.046 170.0) | #4F7366 | Focus ring (2px, 2px offset) | 5.3:1 |
| `--color-ok` | `text-ok` | oklch(0.530 0.098 159.2) | #2E7D57 | Booked | 5.0:1 on white |
| `--color-ok-bg` | `bg-ok-bg` | oklch(0.950 0.016 160.6) | #E6F2EB | Booked badge background | |
| `--color-warn` | `text-warn` | oklch(0.560 0.117 77.5) | #9A6A00 | To call us icon | 4.7:1 on white |
| `--color-warn-fg` | `text-warn-fg` | oklch(0.473 0.099 77.4) | #7A5300 | Warning text | 6.9:1 on white |
| `--color-warn-bg` | `bg-warn-bg` | oklch(0.968 0.041 90.2) | #FFF4D6 | Warning badge and banner | |
| `--color-danger` | `text-danger` | oklch(0.500 0.182 29.5) | #B42318 | Do not contact, urgent, errors | 6.6:1 on white |
| `--color-danger-bg` | `bg-danger-bg` | oklch(0.948 0.020 25.2) | #FBE9E7 | Danger badge background | |
| `--color-info` | `text-info` | oklch(0.459 0.030 244.9) | #4A5A68 | New (slate) | 7.1:1 |
| `--color-info-bg` | `bg-info-bg` | oklch(0.943 0.008 241.7) | #E8EDF1 | New badge background | |
| `--color-neutral` | `text-neutral` | oklch(0.491 0.013 235.0) | #5A6267 | Unsuccessful and declined | 6.2:1 |
| `--color-neutral-bg` | `bg-neutral-bg` | oklch(0.951 0.003 228.8) | #EDEFF0 | Neutral badge background | |
| `--color-disabled-bg` | `bg-disabled-bg` | oklch(0.951 0.003 228.8) | #EDEFF0 | Disabled control fill | |

### 2.2 Dark

Dark is designed separately. Applies under `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme="light"])`) and under `:root[data-theme="dark"]`.

| Token | OKLCH | Hex | Contrast notes |
|---|---|---|---|
| `--color-canvas` | oklch(0.211 0.006 236.9) | #16191B | base |
| `--color-surface` | oklch(0.241 0.008 240.2) | #1C2023 | base |
| `--color-panel` | oklch(0.269 0.009 234.1) | #22272A | base |
| `--color-line` | oklch(0.370 0.012 232.7) | #3A4145 | decorative |
| `--color-line-subtle` | oklch(0.308 0.011 225.5) | #2A3134 | decorative |
| `--color-line-strong` | oklch(0.529 0.014 231.9) | #646D72 | 3.3:1 on canvas |
| `--color-ink` | oklch(0.932 0.004 236.5) | #E6E9EB | 14.5:1 on canvas |
| `--color-ink-muted` | oklch(0.771 0.011 234.9) | #AEB6BB | 8.6:1 |
| `--color-ink-subtle` | oklch(0.707 0.012 234.9) | #9AA2A7 | 6.8:1 |
| `--color-ink-disabled` | oklch(0.509 0.013 235.0) | #5F676C | exempt |
| `--color-accent` | oklch(0.782 0.047 167.6) | #9CC2B2 | 9.1:1 |
| `--color-accent-hover` | oklch(0.835 0.040 167.0) | lighter sage | |
| `--color-accent-active` | oklch(0.885 0.030 166.0) | lightest sage | |
| `--color-accent-subtle` | oklch(0.325 0.030 161.1) | #26392F | selected row |
| `--color-accent-fg` | oklch(0.227 0.024 172.2) | #10201B | 8.7:1 on accent |
| `--color-ok` | oklch(0.752 0.102 161.3) | #6FC39A | 8.4:1 |
| `--color-ok-bg` | oklch(0.297 0.036 163.3) | #1B3328 | |
| `--color-warn` | oklch(0.835 0.132 83.6) | #F2C15A | 10.6:1 |
| `--color-warn-fg` | oklch(0.835 0.132 83.6) | #F2C15A | |
| `--color-warn-bg` | oklch(0.307 0.048 87.4) | #3A2E10 | |
| `--color-danger` | oklch(0.759 0.144 26.6) | #FF8A7F | 7.7:1 |
| `--color-danger-bg` | oklch(0.268 0.048 24.7) | #3A1C1A | |
| `--color-info` | oklch(0.756 0.031 240.3) | #9FB3C2 | 8.2:1 |
| `--color-info-bg` | oklch(0.302 0.027 242.4) | #22303B | |
| `--color-neutral` | oklch(0.771 0.011 234.9) | #AEB6BB | |
| `--color-neutral-bg` | oklch(0.269 0.009 234.1) | #22272A | |
| `--color-disabled-bg` | oklch(0.269 0.009 234.1) | #22272A | |

Rules:
- Text pairs must reach 4.5:1 (body) or 3:1 (large text, icons, non-text UI). Check with both themes.
- Selection (`::selection`) uses `accent-subtle` with `ink` text. Focus rings use `focus`. Scrollbars use `line-strong`.
- Never use the accent for decoration, inactive states or large fills. Accent is for: primary action, selected item, focus, progress.

## 3. Typography

### 3.1 Families

- **Staff app:** Figtree only (`--font-sans`), loaded from @fontsource (400, 500, 600, 700). Tabular numerals (`tabular-nums`) for dates, phones, counts, reference numbers and table numeric columns (applied to `td`, `th` and `.tabular`).
- **Public form:** Montserrat 300 for headings and Montserrat 500 for the wordmark (`--font-brand`), Quicksand 400, 500 and 600 for body, labels and buttons (`--font-form`). Headings are lowercase.
- No monospace anywhere, including the code-like reference numbers. Use tabular Figtree.

### 3.2 Scale (fixed rem, ratio about 1.2, not fluid)

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-xs` | 12px (0.75rem) | 1.4 | Meta, column captions, badges on small screens |
| `text-sm` | 13px (0.8125rem) | 1.45 | Compact table cells, helper text, timestamps, badges |
| `text-base` | 15px desktop, 16px phone (0.9375rem / 1rem) | 1.5 | Body, inputs, buttons, table cells |
| `text-lg` | 18px (1.125rem) | 1.35 | Panel titles, sheet titles, dialog titles |
| `text-xl` | 21.6px (1.35rem) | 1.25 | Page titles (`h1`), patient name on detail |
| `text-2xl` | 26px (1.625rem) | 1.25 | Dashboard headline figures only |

- Phones use 16px body (the `--text-base` media query). Inputs are 16px on all sizes to stop iOS zoom.
- Weights: 400 body, 500 labels and emphasis, 600 headings. Never bold body copy.
- Measure: prose at 65 to 75 characters. Tables and data can be wider.
- Headings: sentence case in the staff app ("Referral progress", not "REFERRAL PROGRESS"). No eyebrow labels or kickers above headings.

## 4. Spacing, density and sizes

- 4pt base (Tailwind default: 1 = 4px). Tight groups use 4 to 8px. Sections use 16 to 24px. Page padding is 16px on phones and 24px on desktop.
- Form field gap: 20px between fields (`gap-5`). Label to control: 6px (`gap-1.5`).
- Panel padding: 16px. Dialog and sheet padding: 20px horizontal, 16px vertical.
- Table rows: 40px comfortable (default) or 32px compact (toggle). Header 36px.
- Touch targets: 44px minimum on phones (`h-11`). Desktop controls are 36px (`md:h-9`), small controls 32px (`md:h-8`).
- Icons: 16px inside controls and badges, 20px in navigation and empty states.

## 5. Shape, borders and elevation

- Radius: 8px (`rounded-control`) on controls, buttons, inputs, menu items. 12px (`rounded-panel`) on panels, sheets and dialogs. Pills (`rounded-pill`) for badges and tiny indicators only. Never nest a bordered panel inside another panel.
- Borders: 1px hairline (`border-line`). Strong edges `border-line-strong`.
- Elevation is declared once. Cards on work screens: `shadow-card` (1 to 3px, very soft). Overlays (popover, dialog, sheet, command palette, tooltip, drawer when floating): `shadow-overlay`.
- No hard offset shadows, no coloured halos, no glass, no gradients.

## 6. Motion

- Duration: 150ms (`--duration-fast`) for hover and colour, 200ms (`--duration-base`) for sheet and dialog. Easing: `--ease-out` (cubic-bezier(0.16, 1, 0.3, 1)).
- Motion conveys state only: hover, press, selection, sheet open, toast, spinner. No page-load choreography and no decorative loops.
- Skeletons pulse (`animate-pulse`). Spinners only inside a control that is loading, never centred in content.
- `prefers-reduced-motion: reduce` disables transitions and animations (global rule in `globals.css`).

## 7. Icons

- Lucide, stroke width 1.5 everywhere. Sizes 16 and 20 only.
- Icons are always paired with a label on status and action. Icon-only buttons need an `aria-label` (`IconButton` enforces it).
- Map names through `src/components/ui/icons.tsx` (`ICONS` and `DOMAIN_ICON`). Do not import Lucide directly in feature code.
- No emoji, no Unicode glyphs as icons.

## 8. Status palette

Every status is icon + label. Colour is never the only signal. Tone maps to the tokens in section 2.

| Meta | Label | Icon key (Lucide) | Tone | Used for |
|---|---|---|---|---|
| Status `new` | New | `dot` (Circle) | info (slate) | Received, no contact yet |
| Status `contacting` | Contacting | `clock` | accent (sage) | Cadence running |
| Status `to_call_us` | To call us | `phone` (PhoneIncoming) | warning (amber) | Patient to call the clinic |
| Status `booked` | Booked | `check` (CircleCheck) | success (green) | Booked in Edge |
| Status `do_not_contact` | Do not contact | `ban` | danger (red) | Never contact |
| Status `unsuccessful` | Unsuccessful | `x` (CircleX) | neutral (grey) | Closed after final contact |
| Status `declined` | Declined | `x` | neutral (grey) | Patient or dentist declined |
| Flag urgent | Urgent | `flag` | danger (red) | The only loud colour in the app |
| Overdue | "overdue, was due Mon 1 Dec" | `alert` (TriangleAlert) | danger text | Due date passed |
| SMS `queued` | Queued | `clock` | accent | Waiting to send |
| SMS `sent` | Sent | `send` | neutral | Sent to carrier |
| SMS `delivered` | Delivered | `check` | success | Delivered |
| SMS `failed` | Failed | `alert` | danger | Needs a person, see Inbox |
| SMS `received` | Reply | `reply` | info | Inbound reply, needs triage |
| Outcome | Labels from the tracker | `message`, `check`, `phone`, `send`, `mail` | neutral or success | Contact outcome |

Use `StatusBadge`, `OutcomeBadge`, `SmsStatusBadge` or `MetaBadge` from `components/ui/badges.tsx`. Do not write new status colours.

## 9. Layout and navigation

### 9.1 Breakpoints

| Range | Name | Navigation | Content |
|---|---|---|---|
| under 768px | Phone | Bottom bar with four destinations (Today, Referrals, New referral, Inbox) plus a More button that opens a sheet with Referrers, Dashboard, Import and Settings. Five slots in total, as the plan's screen list specifies | One column. Lists become cards |
| 768px to 1023px | Tablet | Icon rail (72px). Labels as tooltips and `aria-label` | One column, tables with fewer columns |
| 1024px to 1279px | Desktop | Light sidebar (240px) with grouped sections (Work, Insights, Admin) and a Collapse control | Full width list. The referral opens in a 520px drawer that pushes the list |
| 1280px and wider | Wide desktop | Sidebar | Full width list with the same 520px drawer. No permanent empty pane |

- Tailwind classes: `md:` is 768px and `lg:` is 1024px, `xl:` is 1280px.
- The sidebar and rail offset the main column (`md:pl-[var(--rail-width)] lg:pl-[var(--sidebar-width)]`).
- Top bar: 56px, sticky, full width, dark teal (`bar`). Holds the brand chip (white, with the Ethos wordmark) and the product name "Ethos Referrals", a centred search (Ctrl+K), a teal New referral button, the inbox bell with a count (replies to action and failed texts) and the avatar menu. On phones: menu, search, bell and avatar.

### 9.2 Drawer

- Used by Today and Referrals at every desktop width. The list keeps the full width. Clicking or pressing Enter on a row opens `ReferralDrawer`.
- Desktop (1024px and wider): a fixed 520px column on the right. It pushes the list, so nothing overlaps the work.
- Below 1024px: the drawer covers the screen with its own header, and the close button returns to the list.
- Escape closes it (unless a dialog or menu is open on top). j, k and Enter keep working on the list while it is open.
- The drawer has an "Open full page" link to `/referrals/:id/full` for the whole record.
- There is never an empty detail pane. With nothing selected, the list takes the full width.

### 9.3 Page structure

1. `PageHeader` (title, optional description, optional back link, actions wrap under the title on phones).
2. Toolbar (search, filters, density toggle). Filters wrap, never scroll sideways on desktop.
3. Content: `DataTable` (desktop) or cards (phone), or `Panel` groups.
4. Empty, loading and error states inside the content area, never replacing the header.

### 9.4 Identity and safety

- Every referral detail and logging screen shows `PatientIdentity` (full name, DOB, age group, phone) together.
- Lists show `PatientIdentity variant="row"` with the phone masked (`maskPhone`) until the row opens.
- The avatar in the top bar carries the one identity block: name and role in its menu, with Switch role (prototype) and Sign out. The More sheet (phone) also shows name, role and sign out. The accessible name starts "Logged in as".
- The screen locks after 15 minutes idle (`IdleLock`), with the content blurred.

## 10. Components and states

Every interactive component must provide: default, hover, focus-visible, active, disabled, loading (where it triggers async work), and error (where it validates). Lists and panels also provide empty and skeleton. Shared components live in `src/components/`. See `src/components/README.md` for the inventory and usage.

| Component | File | Notes and states |
|---|---|---|
| Button | `ui/button.tsx` | Variants: primary, secondary, ghost, danger. Sizes sm, md, lg. `loading` shows a spinner and sets `aria-busy`. Disabled uses `disabled-bg` and `ink-disabled` |
| IconButton | `ui/button.tsx` | `aria-label` is required. Ghost or secondary |
| Input, Textarea, Select | `ui/forms.tsx` | 44px phone, 36px desktop. Placeholder `ink-subtle`. Invalid sets `aria-invalid` and a danger border. Select is native for mobile pickers |
| Field | `ui/forms.tsx` | Label, optional `hint`, `error` with an alert icon. Provides id and aria wiring to children through context |
| Checkbox, RadioGroup | `ui/forms.tsx` | Radix primitives. Radio `layout="row"` for two or three short choices |
| Combobox | `ui/combobox.tsx` | Async typeahead, ARIA combobox pattern. Up, Down, Enter, Escape. Shows "Type at least 2 letters" until the threshold |
| DatePicker | `ui/date-picker.tsx` | Typed DD/MM/YYYY, numeric keyboard, validates on blur with the reason |
| Badge, StatusBadge and friends | `ui/badges.tsx` | Icon + label, tone from section 8 |
| StepTracker | `ui/step-tracker.tsx` | Six stages. Current has `aria-current="step"`, done shows a check, closed shows an x |
| DataTable | `ui/data-table.tsx` | Virtualised (TanStack Table + Virtual). Sticky header. Keys: j or ArrowDown, k or ArrowUp, Home, End, Enter. Active row has an accent inset bar. Under 768px uses `renderCard` |
| Panel | `ui/surfaces.tsx` | Hairline box, title, description, actions. No nesting |
| Skeleton | `ui/surfaces.tsx` | Pulse, uses `line-subtle` |
| EmptyState | `ui/surfaces.tsx` | Icon, title, description, one action. Teaches the next step |
| KeyValue | `ui/surfaces.tsx` | Definition list, one or two columns |
| Kbd | `ui/surfaces.tsx` | Keyboard hints in menus and palette |
| Dialog | `ui/overlays.tsx` | Centred. Use for confirm and destructive decisions only |
| Sheet | `ui/overlays.tsx` | Right on desktop, bottom on phones. Use for logging outcomes and detail on small screens |
| Popover | `ui/overlays.tsx` | Anchored, portalled. Escapes overflow containers |
| Tooltip | `ui/overlays.tsx` | Supplementary only. Never the only label |
| Tabs | `ui/tabs.tsx` | Radix. Scrolls sideways on phones. Active underline in accent. Used for referral sections (Overview, Timeline, Messages, Referrer, Attachments) |
| Toaster, toast helpers | `ui/toast.tsx` | Sonner. `notifySuccess`, `notifyError`, `showUndoToast` (5 seconds) |
| PatientIdentity | `ui/patient-identity.tsx` | Anti wrong-patient block. `header` and `row` variants. Phone is tap-to-call on detail |
| Timeline | `ui/timeline.tsx` | Newest first. Every entry shows actor and time. Empty text supplied |
| PageHeader | `ui/page-header.tsx` | Title, description, back link, actions |
| ReferralDrawer | `features/queue/ReferralDrawer.tsx` | 520px right drawer on desktop, full screen below 1024px. Escape closes |
| SplitView | `ui/split-view.tsx` | Retired from Today and Referrals. Not used by the queue screens |
| KpiCard | `ui/kpi-card.tsx` | Summary card with count, label and icon on a soft tint. Clickable filter with aria-pressed |
| PillFilter | `ui/pill-filter.tsx` | Fully rounded filter button with a count. Bucket bars and quick filters |
| Wordmark, Monogram | `brand/wordmark.tsx` | Text fallback. Prefer `public/brand/ethos-logo.png` for the header and login |

### 10.1 State copy

- Loading: skeleton rows or a labelled spinner inside the control. Name what is loading ("Searching").
- Empty: teach the next step. "Queue clear for today. Next due: Thu 4 Dec." Not "Nothing here".
- Error: name the problem, then the recovery. "Enter the Edge patient ID before marking this referral booked."
- Offline: `OfflineBanner` at the top. Writes are not queued in the prototype.

## 10.2 Patterns: summary cards, pill filters and tabs

These patterns make the work screens easier to scan. They are used on Today and Referrals, and in the referral drawer.

**Summary cards (`KpiCard`)**
- A row of 4 cards above the list. Each shows a small uppercase label, a large count (`text-2xl`, tabular, coloured by tone: danger, warn, accent, ok) and a caption, on a white card with a 1px `line` border and `shadow-card`.
- Cards are filters. Clicking one narrows the list. The active card has a sage ring and `aria-pressed="true"`. Clicking it again clears the filter.
- Two columns on phones, four on desktop. Card radius is `rounded-panel` (12px), padding 16px.
- The number carries the colour and the label stays ink, so contrast holds in both themes (each tone is 4.5:1 or better on white).

**Pill filters (`PillFilter`)**
- Fully rounded (`rounded-pill`) buttons with an icon, a label and a count. Height 44px on phones, 36px on desktop.
- Used for the bucket bar, sub-filters (for example Day 1, Day 14 and 3 month final) and quick filters.
- A single row that scrolls sideways on phones. It wraps on desktop only when there is space. Never stacks into a tall block.
- The active pill has an accent border and a subtle accent fill. Counts are text, not colour alone.

**Tabs for sections**
- A referral has sections, so the drawer and the full page use `Tabs`: Overview (booking, details, flags), Timeline, Messages (texts only), Referrer (and possible duplicates), Attachments.
- The next action, the step progress and the action row sit above the tabs, so the first thing an agent needs is never behind a tab.
- Tabs keep their order on every screen size and scroll sideways on phones.

**Work screen layout (Today and Referrals)**
- Page header, then summary cards, then pill filters, then the table, then the bulk bar when rows are selected.
- The table is full width with a flat header row. Rows are 40px (comfortable) or 32px (compact).
- On phones the table becomes cards. The primary action sits at the bottom of each card, within thumb reach.

## 10.3 Lists: server paging, sorting and filtering (default for every list screen)

Every screen that lists records in columns follows this pattern. It is not optional.

**Server paging (all lists)**
- Lists are paged on the server: **100 rows per page** (`PAGE_SIZE`). Supabase (PostgREST) returns at most **1,000 rows per request** (`SERVER_MAX_ROWS`), so no screen may rely on fetching everything.
- Filtering, search, sorting and paging all run on the server, in a query or function. The client never filters or sorts the page it holds, because that page is not the whole set.
- A search sends a new server query over the full data set (debounced with `useDebouncedValue`). It never narrows the rows already on screen.
- Any change of filter, search or sort returns to page 1.
- Counts shown on screen (result totals, tab and pill counts, nav badges) come from the server (`total` on a page, or a count function), never from `rows.length`.
- List endpoints return denormalised rows (for example `ReferralRow` carries the clinic, referrer and owner names), so a page renders without downloading lookup tables.
- The pager sits under the table: "1 to 100 of 4,227", Previous and Next (44px on phones), and "Page 1 of 43" on desktop.
- Aggregates (work queue buckets, dashboard KPIs, CSV export, import matching) are server functions too.
- How: `useServerList({ columns, initialSorting, resetOn: [filters] })` holds page and sort state and builds `offset`, `limit` and `orderBy`. Pass `pagination={list.pagination(total)}` to `DataTable`. The reference implementation is `src/features/referrers/ReferrersPage.tsx`.

**Desktop and tablet (768px and up): sortable column headings**
- Every data column heading is a button. Clicking cycles ascending, descending, then off.
- Indicator: an up arrow (ascending) or down arrow (descending) in the accent colour beside the active heading, which also turns semibold. Inactive sortable headings show a faint up/down arrow so users can see they are clickable.
- `<th aria-sort="ascending|descending|none">` is set automatically for screen readers. The button's accessible name says what the next click does ("Due, sort descending").
- One active sort at a time. Empty values always sort last.
- How (server-paged lists, the default): give each sortable column `meta: { sortField: '<server field>' }`. With `pagination` set, only those columns sort, and the table never reorders rows itself. In development, DataTable warns about a titled column with no `sortField`.
- How (small in-memory lists only, such as a fixed lookup table): `DataTable` sorts client side when there is no `pagination`. Give each data column an `accessorFn` that returns a sortable primitive (string, number or ISO date) or `undefined` for empty. Columns without an accessor (checkbox, actions) are not sortable. Set `enableSorting: false` only for a data column that should not sort, and say why in a comment. In development, DataTable warns in the console about a titled column with no accessor.
- Pages may set a sensible starting sort with `initialSorting` (for example Due ascending on the work queue).

**Phone (under 768px): Filter and Sort buttons with bottom sheets**
- Cards have no headings to tap, so list pages render `MobileListControls` above the list. It replaces the inline filter rows, which are hidden below md.
- A two-button toolbar: **Filter** (shows the number of active filters) and **Sort** (shows the current sort, for example "Due ↑"). Both are 44px, full-width halves.
- Active filters appear as a horizontally scrolling row of removable chips, plus "Clear all".
- Filter opens a bottom sheet with filters **grouped** under headings (a `fieldset` and `legend` per group, for example Status, Step, Clinic, Owner, Date). Filters apply live. The footer has "Clear all" and "Show N referrals", which closes the sheet.
- Sort opens a bottom sheet: a radio list of the same sortable columns as desktop, then Ascending or Descending, plus "Clear sort" and "Done".
- Tabs and summary cards stay visible on phones (they are navigation, not filters).
- How: keep sort state in `useServerList` and pass `list.sorting` and `list.setSorting` to both `DataTable` and `MobileListControls` (`sortOptions={sortOptions(columns)}`), so phone and desktop share one sort. `resultCount` is the server total.

## 11. Interaction rules

- **Confirm inline or in a dialog only when the action is outward or irreversible.** Sending an SMS shows the rendered message, recipient and template before send. Do Not Contact, Declined and Return to referrer require a reason.
- **Reversible status changes** show an undo toast for 5 seconds (`showUndoToast`).
- **Forms:** visible labels, helper text, validation on blur, errors under the field, focus the first invalid field on submit. Drafts autosave (public form and manual intake).
- **Australian formats:** DD/MM/YYYY dates (`DatePicker`), 04xx xxx xxx mobiles (`formatAuMobile`), 4-digit postcodes (`isAuPostcode`).
- **Keyboard (desktop):** `j` and `k` move in lists, `Enter` opens, `n` starts a new referral (not while typing), `Ctrl+K` opens the command palette, `/` focuses search where available. Escape closes overlays.
- **Phone:** tap to call and tap to text on phone numbers. Log outcome opens as a bottom sheet with large targets.
- **Errors from SMS:** show the cause (invalid number, opted out) and offer "Fix number and resend".

## 12. Public referral form (`refer.html`)

- Brand presence: Montserrat 300 lowercase headings, Quicksand body and labels, sage accent, generous whitespace. Matches the Ethos website tone.
- One column on every size. Multi-step, with a progress line and short steps.
- Headings lowercase (`refer a patient`). Body copy is plain sentences. No emoji, no decoration.
- Use `public/brand/ethos-logo.png` at the top. The page title is generic ("Refer a patient").
- Inputs follow the same states as the staff app, with 44px targets and correct `inputmode` and `autocomplete`.
- Drafts use localStorage, wrapped in try/catch, and never hold data after submit.
- The confirmation shows the reference number only. Never echo the submitted patient data.
- The public bundle imports `styles/globals.css` and `styles/public.css` only. It never imports the app shell, data layer or service worker.

## 13. Copy rules

- Australian English spelling (organise, recognise, programme where needed, centre).
- No em dashes. No Oxford comma. Use commas and full stops; no hyphens used as dashes in sentences.
- Sentence case in the staff app. Lowercase headings only on the public form.
- Controls name their action ("Mark booked", "Log outcome", "Send text"). Never "OK" or "Submit" alone where a specific verb exists.
- No emoji, anywhere.

## 14. How to build a screen

Checklist for every feature agent. Tick each item before you hand back.

1. Read `PRODUCT.md`, this file and `src/components/README.md`.
2. Use only the shared components in `src/components/` and the tokens. No raw hex, no new colours, no Lucide imports in feature code (use `ICONS`).
3. Put the page in your feature folder. Export it from that folder's `index.ts`. Do not edit other folders.
4. Read data through `src/data/hooks.ts`. Write through the hooks, passing `actorId` from the session (`useAuth`). Never import the mock adapter directly.
5. Title with `PageHeader`. Use the header pattern from section 9.3.
6. Layout at 360px, 768px, 1024px and 1280px. Check no horizontal page scroll and that the bottom nav does not cover content (`pb-[var(--bottom-nav-height)]` is already on the shell).
7. Every interactive element has: default, hover, focus-visible (automatic outline), active, disabled, loading and error where relevant.
8. Every list and panel has: skeleton, empty (with an action or next step) and error.
9. Every patient screen shows `PatientIdentity`. Lists mask phones.
10. Status is icon + label. Overdue is text, not only red.
11. Irreversible or outward actions confirm with the rendered content. Reversible status changes use `showUndoToast`.
12. Keyboard: tables use `DataTable` (j, k, Enter). Dialogs trap focus (Radix). Tab order follows visual order.
12a. Lists follow section 10.3: paged on the server (100 per page, never more than 1,000 per request), with filters, search and sort sent to the server; every sortable column declares `meta.sortField`; phones get `MobileListControls` (grouped Filter sheet and Sort sheet) sharing the page's sort state.
13. Motion: state only, 150 to 200ms, reduced motion respected.
14. Copy follows section 13. No em dashes, no Oxford commas, no emoji.
15. Light and dark both checked. No colour-only meaning.
16. Run `npm run typecheck` and `npm run lint` before handing back.

## 15. Files

- Tokens: `src/styles/tokens.css` (values), `src/styles/globals.css` (Tailwind theme mapping, base styles).
- Public brand layer: `src/styles/public.css`.
- Components: `src/components/ui/*`, `src/components/brand/wordmark.tsx`, inventory in `src/components/README.md`.
- Status and copy metadata: `src/domain/display.ts`.
- Icons: `src/components/ui/icons.tsx`.
- Logo: `public/brand/ethos-logo.png`. PWA icons: `public/icons/` (192, 512 and maskable 512 PNG, plus SVG sources).

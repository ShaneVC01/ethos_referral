# Shared components

Inventory of the shared UI kit. Import from the file shown, or from the folder barrel when one exists. Feature code uses these components only. Tokens and states are defined in `DESIGN.md`.

Conventions:
- Every component accepts `className` and merges it with `cn()` (from `@/lib/utils`).
- Icons come from `ICONS` in `ui/icons.tsx`. Do not import Lucide directly in feature code.
- Status is always icon + label. Colour is never the only signal.
- Interactive components provide default, hover, focus-visible, active, disabled, loading and error states.

## Actions: `ui/button.tsx`

- **Button**: primary, secondary, ghost or danger action. `loading` shows a spinner and sets `aria-busy`.
  `<Button variant="primary" loading={saving} icon="send">Send text</Button>`
- **IconButton**: icon-only action. `aria-label` is required by the type.
  `<IconButton icon="close" aria-label="Close" />`

## Forms: `ui/forms.tsx`

- **Field**: label, helper text and error wiring for one control. Child controls pick up ids automatically.
  `<Field label="Phone" hint="Mobile or landline" error={errors.phone}><Input inputMode="tel" /></Field>`
- **Input**: single line text, 44px on phones and 36px on desktop.
  `<Input inputMode="numeric" autoComplete="off" />`
- **Textarea**: multi-line notes and comments. `<Textarea rows={4} />`
- **Select**: native select for reliable mobile pickers. `<Select><option value="a">Option</option></Select>`
- **Checkbox**: Radix checkbox with label and optional description.
  `<Checkbox checked={urgent} onCheckedChange={setUrgent} label="Urgent" />`
- **RadioGroup**: one choice from a short list. `layout="row"` for two or three options.
  `<RadioGroup label="Role" value={role} onValueChange={setRole} options={[{ value: 'agent', label: 'Agent' }]} />`

## Pickers: `ui/combobox.tsx`, `ui/date-picker.tsx`

- **Combobox**: async typeahead with ARIA combobox behaviour. The caller owns the search.
  `<Combobox label="Referrer" value={id} selectedLabel={name} options={results} loading={isFetching} onInputChange={setQuery} onChange={(v) => setId(v)} />`
- **DatePicker**: typed DD/MM/YYYY date with validation on blur. Value is 'YYYY-MM-DD'.
  `<DatePicker label="Date of birth" value={dob} max={today} onChange={setDob} />`

## Status and identity: `ui/badges.tsx`, `ui/patient-identity.tsx`, `ui/step-tracker.tsx`

- **Badge**: generic pill with tone and optional icon. `<Badge tone="info" icon="clock">Pending</Badge>`
- **MetaBadge**: any domain meta from `domain/display.ts`. `<MetaBadge meta={STATUS_META.booked} />`
- **StatusBadge**: referral status. `<StatusBadge status="to_call_us" />`
- **OutcomeBadge**: contact outcome. `<OutcomeBadge outcome="lm_coax_sent" />`
- **SmsStatusBadge**: text message status. `<SmsStatusBadge status="failed" />`
- **UrgentBadge**: urgent flag. `<UrgentBadge />`
- **PatientIdentity**: name, DOB, age group and phone together. Use `variant="row"` in lists with `maskPhone`.
  `<PatientIdentity firstName="Ava" lastName="Lee" dob="2015-03-02" ageGroup="C" phone="0412345678" />`
- **StepTracker**: cadence progress. `<StepTracker stageIndex={trackerStageIndex(referral)} closed={!!referral.closedReason} />`

## Data display: `ui/data-table.tsx`, `ui/timeline.tsx`, `ui/surfaces.tsx`

- **DataTable**: virtualised table with sticky header, j, k and Enter keys, and density toggle. Pass `renderCard` for phones. **Server paging is the default for repository lists**: pass `pagination={list.pagination(total)}` from `useServerList` (`src/data/use-server-list.ts`) and the table sorts manually and shows the Pager (100 per page). In that mode a column sorts only when it has `meta: { sortField }`. Without `pagination` (small in-memory lists only) it sorts client side from `accessorFn`. Headings always show an arrow indicator and `aria-sort`. See DESIGN.md 10.3.
- **Pager**: rendered by DataTable in server mode; exported for custom list layouts.
  `{ id: 'due', header: 'Due', accessorFn: (r) => r.dueAt ?? undefined, cell: ... }`
  `<DataTable caption="Referrals" data={page.items} columns={columns} getRowId={(r) => r.id} onRowActivate={open} sorting={list.sorting} onSortingChange={list.setSorting} pagination={list.pagination(page.total)} itemNoun="referrals" />`
- **MobileListControls** (`ui/list-controls.tsx`): phone-only (md:hidden) Filter and Sort buttons, removable active-filter chips, a grouped filter bottom sheet and a sort bottom sheet. Required on every list page that shows cards on phones. Hide the inline desktop filter rows below md.
  `<MobileListControls itemNoun="referrals" resultCount={rows.length} groups={[{ id: 'status', label: 'Status', activeCount: status ? 1 : 0, content: <StatusPills /> }]} activeChips={chips} onClearFilters={clear} sortOptions={sortOptions(columns)} sorting={sorting} onSortingChange={setSorting} />`
- **SortSheet**: the sort bottom sheet on its own, for custom list layouts.
- **Timeline**: newest first history with actor and time on every entry.
  `<Timeline items={[{ id, at, actor: 'BM', title: 'Coax sent' }]} />`
- **Panel**: hairline container with title, description and actions. Do not nest panels.
  `<Panel title="Referrer" actions={<Button variant="ghost">Edit</Button>}>...</Panel>`
- **Skeleton**: pulsing placeholder while data loads. `<Skeleton className="h-10 w-full" />`
- **EmptyState**: explains the empty area and offers the next step.
  `<EmptyState icon="inbox" title="Inbox clear" description="Failed texts and replies appear here." />`
- **KeyValue**: label and value pairs as a definition list. `<KeyValue items={[{ label: 'Source', value: 'Email' }]} />`
- **Kbd**: keyboard shortcut hint. `<Kbd>Ctrl</Kbd>`

## Overlays: `ui/overlays.tsx`

- **Dialog**: centred, for confirm and destructive decisions. Title is required.
  `<Dialog open={open} onOpenChange={setOpen} title="Mark as declined?" footer={<Button>Confirm</Button>}>...</Dialog>`
- **Sheet**: right side on desktop, bottom on phones. Use for logging outcomes and quick detail.
  `<Sheet open={open} onOpenChange={setOpen} title="Log outcome" side="bottom">...</Sheet>`
- **Popover**: anchored panel that escapes overflow containers. `<Popover trigger={<Button>Filters</Button>}>...</Popover>`
- **Tooltip**: supplementary hint only. `<Tooltip content="Copy phone"><IconButton icon="copy" aria-label="Copy phone" /></Tooltip>`

## Navigation and layout: `ui/tabs.tsx`, `ui/page-header.tsx`, `ui/split-view.tsx`

- **Tabs, TabsList, TabsTrigger, TabsContent**: Radix tabs with an accent underline.
  `<Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="notes">Notes</TabsTrigger></TabsList><TabsContent value="notes">...</TabsContent></Tabs>`
- **PageHeader**: page title, description, back link and actions. `<PageHeader title="Referrals" actions={<Button>Export</Button>} />`
- **SplitView**: list and detail side by side at 1280px and wider. `<SplitView list={list} detail={detail} detailOpen={!!id} />`

## Feedback: `ui/toast.tsx`

- **Toaster**: mounted once in the app shell. `<Toaster />`
- **notifySuccess / notifyError**: short confirmations and errors. `notifySuccess('Outcome logged')`
- **showUndoToast**: reversible change with a 5 second Undo. `showUndoToast('Marked to call us', () => revert())`

## Brand: `brand/wordmark.tsx`

- **Wordmark**: text fallback wordmark in Montserrat. Prefer `/brand/ethos-logo.png` in the header and login. `<Wordmark />`
- **Monogram**: square "e" mark for the rail and small spaces. `<Monogram />`

## Icons: `ui/icons.tsx`

- **ICONS**: named Lucide icons used by the app, for example `ICONS.search`, `ICONS.plus`, `ICONS.spinner`.
- **DOMAIN_ICON**: maps domain icon keys (`check`, `phone`, `ban`, `dot`, `clock`, `x`, `flag`, `message`, `mail`, `send`, `alert`, `user`, `globe`, `file`, `reply`) to icons.
- **UiIconName**: type of an `ICONS` key, used by props such as `Button icon`.

## Summary and filters: `ui/kpi-card.tsx`, `ui/pill-filter.tsx`

- **KpiCard**: summary count on a soft tint. Clickable filter with `aria-pressed`. Tones: neutral, accent, danger, warning, info, success.
  `<KpiCard label="Overdue" count={6} icon="alert" tone="danger" active={group === 'overdue'} onClick={() => setGroup('overdue')} />`
- **PillFilter**: fully rounded filter button with an optional count. Use for bucket bars and sub-filters.
  `<PillFilter label="Calls due" icon="phone" count={19} active={active} onClick={select} />`

## Drawer: `features/queue/ReferralDrawer.tsx`

- **ReferralDrawer**: the referral record beside a list. 520px on desktop (pushes the list), full screen below 1024px. Escape closes.
  `<ReferralDrawer id={referralId} focusItem={item} onClose={close} />`


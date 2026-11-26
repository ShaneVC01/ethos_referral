import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Dialog } from '@/components/ui/overlays';
import { PageHeader } from '@/components/ui/page-header';
import { TabsContent, TabsList, TabsTrigger, Tabs } from '@/components/ui/tabs';
import { CadenceTab } from './CadenceTab';
import { DemoTab } from './DemoTab';
import { LookupsTab } from './LookupsTab';
import { SessionTab } from './SessionTab';
import { StaffTab } from './StaffTab';
import { TemplatesTab } from './TemplatesTab';
import { NoticeTemplatesTab } from './NoticeTemplatesTab';
import type { TabProps } from './types';
import { Button } from '@/components/ui/button';

const TABS: { key: string; label: string; Component: (props: TabProps) => JSX.Element }[] = [
  { key: 'cadence', label: 'Cadence', Component: CadenceTab },
  { key: 'templates', label: 'SMS templates', Component: TemplatesTab },
  { key: 'referrer-emails', label: 'Referrer emails', Component: NoticeTemplatesTab },
  { key: 'lookups', label: 'Clinics and orthodontists', Component: LookupsTab },
  { key: 'staff', label: 'Staff and roles', Component: StaffTab },
  { key: 'session', label: 'Session', Component: SessionTab },
  { key: 'demo', label: 'Demo tools', Component: DemoTab },
];

export function SettingsPage() {
  const [active, setActive] = useState('cadence');
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});

  const setTabDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyMap((m) => (m[key] === dirty ? m : { ...m, [key]: dirty }));
  }, []);
  const handlers = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, (dirty: boolean) => setTabDirty(t.key, dirty)])) as Record<string, (dirty: boolean) => void>,
    [setTabDirty],
  );

  const anyDirty = Object.values(dirtyMap).some(Boolean);

  // Leaving the Settings page with unsaved edits asks first.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => anyDirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  return (
    <>
      <PageHeader title="Settings" description="Cadence, texts, clinics, staff and session. Changes apply to new work and are logged." />

      <Tabs value={active} onValueChange={setActive}>
        <TabsList aria-label="Settings sections" className="mb-6">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              {dirtyMap[t.key] ? <span className="sr-only"> (unsaved changes)</span> : null}
              {dirtyMap[t.key] ? <span aria-hidden="true" className="ml-1 size-1.5 rounded-pill bg-warn" /> : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ key, Component }) => (
          <TabsContent key={key} value={key} forceMount className="outline-none data-[state=inactive]:hidden">
            <Component onDirtyChange={handlers[key] ?? (() => undefined)} />
          </TabsContent>
        ))}
      </Tabs>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Leave with unsaved changes?"
        description="Some settings have changes that are not saved yet. Leaving now discards them."
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard and leave
            </Button>
          </>
        }
      />
    </>
  );
}

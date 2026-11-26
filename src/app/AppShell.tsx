import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ICONS } from '@/components/ui/icons';
import { IconButton, Button } from '@/components/ui/button';
import { Popover, Sheet } from '@/components/ui/overlays';
import { Toaster } from '@/components/ui/toast';
import { MockLiveSync } from '@/features/queue/MockLiveSync';
import { useSettings, useSmsMessages } from '@/data/hooks';
import { PublicOutboxBridge } from '@/features/intake';
import { useAuth, ROLE_LABELS } from './auth';
import { NAV_GROUPS, navForRole, type NavGroup, type NavItem } from './nav';
import { useReferrerNotifications } from '@/data/hooks';
import { CommandPalette } from './CommandPalette';
import { DemoClock } from './DemoClock';
import { IdleLock } from './IdleLock';
import { OfflineBanner } from './OfflineBanner';

function isActive(item: NavItem, pathname: string): boolean {
  if (item.match === 'exact') return pathname === item.to;
  if (item.to === '/referrals/new') return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Two letter initials for the avatar. "Susie Mundy" becomes "SM". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

/**
 * Layout. A full width dark teal top bar carries the brand, global search, New referral, the inbox bell and the
 * avatar menu. The sidebar is light, grouped into Work, Insights and Admin, and collapses to icons.
 * Tablet (768 to 1023px): icon rail. Phone (under 768px): bottom nav and a More sheet.
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useSettings();
  // Inbox badge: the server counts the items that need action (a total, not a page).
  const inbox = useSmsMessages({ needsReview: true, limit: 1 });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const items = user ? navForRole(user.role) : [];
  const bottomItems = items.filter((i) => i.bottom);
  const current = items.find((item) => isActive(item, location.pathname)) ?? null;
  // Inbox count: replies to action and failed texts, the two things Inbox needs a person for.
  const inboxCount = inbox.data?.total ?? 0;
  // Referrer notices waiting to be sent, shown as a count on the sidebar link.
  const notices = useReferrerNotifications();
  const unsentNotices = useMemo(() => (notices.data ?? []).filter((n) => n.status === 'pending').length, [notices.data]);

  // Global keys: Ctrl+K (or Cmd+K) opens the palette. "n" starts a new referral when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'n') {
        navigate('/referrals/new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Close the phone menu when the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const signOutNow = () => {
    signOut();
    navigate('/login');
  };

  // Tablet (768 to 1023px) always shows the icon rail. Desktop shows the sidebar unless it is collapsed.
  const sidebarOffset = collapsed ? 'md:pl-[var(--rail-width)]' : 'md:pl-[var(--rail-width)] lg:pl-[var(--sidebar-width)]';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-overlay"
      >
        Skip to content
      </a>

      {/* Top bar: full width, dark teal. Brand, search, New referral, inbox bell, avatar menu. */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 bg-bar px-3 text-white safe-top md:px-4">
        <div className="flex items-center gap-2 md:hidden">
          <IconButton icon="menu" aria-label="Open menu" className="text-white hover:bg-white/10" onClick={() => setMenuOpen(true)} />
        </div>
        <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-control" aria-label="Ethos Referrals, work queue">
          <span className="flex h-9 items-center rounded-control bg-white px-2">
            <img src="/brand/ethos-logo.png" alt="" className="h-6 w-auto" />
          </span>
          <span className="hidden text-base font-semibold text-white sm:inline">Ethos Referrals</span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search patients, phone numbers, referrers or reference (Ctrl K)"
            className="hidden h-10 w-full max-w-xl items-center gap-2 rounded-control border border-white/15 bg-white/10 px-3 text-left text-sm text-white/80 hover:bg-white/15 md:flex"
          >
            <ICONS.search size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">Search patients, phone numbers, referrers...</span>
            <kbd className="hidden rounded border border-white/25 px-1.5 text-xs md:inline">Ctrl K</kbd>
          </button>
        </div>

        <IconButton icon="search" aria-label="Search patients, phone numbers, referrers" className="text-white hover:bg-white/10 md:hidden" onClick={() => setPaletteOpen(true)} />
        <div className="flex shrink-0 items-center gap-2">
          {settings.data?.demoClockEnabled && user.role === 'manager' ? <span className="hidden xl:inline-flex"><DemoClock /></span> : null}
          <Link
            to="/referrals/new"
            className="hidden h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover md:inline-flex"
          >
            <ICONS.plus size={16} strokeWidth={1.5} aria-hidden="true" />
            New referral
          </Link>
          <button
            type="button"
            onClick={() => navigate('/inbox')}
            aria-label={`Inbox, ${inboxCount} ${inboxCount === 1 ? 'item' : 'items'} to action`}
            className="relative inline-flex size-10 items-center justify-center rounded-control hover:bg-white/10"
          >
            <ICONS.bell size={20} strokeWidth={1.5} aria-hidden="true" />
            {inboxCount > 0 ? (
              <span className="tabular absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-[11px] font-semibold leading-none text-white">
                {inboxCount > 99 ? '99+' : inboxCount}
              </span>
            ) : null}
          </button>
          <AccountMenu name={user.name} role={ROLE_LABELS[user.role]} initials={initialsOf(user.name)} onSwitchRole={signOutNow} onSignOut={signOutNow} />
        </div>
      </header>

      {/* Sidebar (desktop): light, grouped. Collapses to icons. */}
      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed bottom-0 left-0 top-14 z-20 hidden flex-col border-r border-line bg-surface md:flex',
          collapsed ? 'w-[var(--rail-width)]' : 'w-[var(--rail-width)] lg:w-[var(--sidebar-width)]',
        )}
      >
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-4">
          {NAV_GROUPS.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-0.5">
                <p className={cn('px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted', collapsed ? 'hidden' : 'hidden lg:block')}>{group}</p>
                {groupItems.map((item) => (
                  <SideLink key={item.to} item={item} active={isActive(item, location.pathname)} compact={collapsed} badge={item.to === '/notices' ? unsentNotices : 0} />
                ))}
              </div>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-line p-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className={cn('flex h-10 items-center gap-3 rounded-control px-3 text-base text-ink-muted hover:bg-panel hover:text-ink', collapsed && 'justify-center px-0')}
          >
            {collapsed ? <ICONS.chevronRight size={20} strokeWidth={1.5} aria-hidden="true" /> : <ICONS.back size={20} strokeWidth={1.5} aria-hidden="true" />}
            {collapsed ? <span className="sr-only">Expand sidebar</span> : 'Collapse'}
          </button>
        </div>
      </aside>

      <OfflineBanner />

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'flex min-h-0 flex-1 flex-col pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0',
          sidebarOffset,
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-4 md:px-6 md:py-6">
          {current ? (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-muted">
              <Link to="/" className="hover:text-ink">
                Home
              </Link>
              <ICONS.chevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
              <span aria-current="page" className="text-ink">
                {current.label}
              </span>
            </nav>
          ) : null}
          <Outlet />
        </div>
      </main>

      {/* Bottom nav (phone) */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface safe-bottom md:hidden"
        style={{ gridTemplateColumns: `repeat(${bottomItems.length + 1}, minmax(0, 1fr))` }}
      >
        {bottomItems.map((item) => (
          <BottomLink key={item.to} item={item} active={isActive(item, location.pathname)} />
        ))}
        <button type="button" onClick={() => setMenuOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium text-ink-muted">
          <ICONS.more size={20} strokeWidth={1.5} aria-hidden="true" />
          More
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu" side="bottom">
        <nav aria-label="More pages" className="flex flex-col gap-4 pb-2">
          {NAV_GROUPS.map((group) => {
            const groupItems = items.filter((i) => i.group === group && !i.bottom);
            if (groupItems.length === 0) return null;
            return <MoreGroup key={group} group={group} items={groupItems} active={(i) => isActive(i, location.pathname)} />;
          })}
        </nav>
        <div className="mt-3 flex items-center gap-3 border-t border-line-subtle pt-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-accent-subtle text-sm font-semibold text-ink" aria-hidden="true">
            {initialsOf(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base text-ink">{user.name}</p>
            <p className="text-sm text-ink-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Button variant="secondary" icon="logout" onClick={signOutNow}>
            Sign out
          </Button>
          <Button variant="ghost" onClick={signOutNow}>
            Switch role (prototype)
          </Button>
        </div>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={items} />
      <IdleLock minutes={settings.data?.idleLockMinutes ?? 15} />
      <PublicOutboxBridge />
      <Toaster />
      <MockLiveSync />
    </div>
  );
}

function MoreGroup({ group, items, active }: { group: NavGroup; items: NavItem[]; active: (item: NavItem) => boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group}</p>
      {items.map((item) => (
        <SideLink key={item.to} item={item} active={active(item)} />
      ))}
    </div>
  );
}

/**
 * The one identity control. Avatar in the top bar. The menu shows the name and role, then Switch role (prototype)
 * and Sign out. The accessible name starts "Logged in as".
 */
function AccountMenu({
  name,
  role,
  initials,
  onSwitchRole,
  onSignOut,
}: {
  name: string;
  role: string;
  initials: string;
  onSwitchRole: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-56"
      trigger={
        <button
          type="button"
          aria-label={`Logged in as ${name}, ${role}. Account menu`}
          className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-ink hover:bg-accent-subtle/80"
        >
          <span aria-hidden="true">{initials}</span>
        </button>
      }
    >
      <div role="menu" className="flex flex-col gap-1">
        <div className="px-2 pb-1 pt-1">
          <p className="text-base font-medium text-ink">{name}</p>
          <p className="text-sm text-ink-muted">{role}</p>
        </div>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onSwitchRole();
          }}
          className="flex h-10 items-center gap-2 rounded-control px-2 text-left text-base text-ink hover:bg-panel"
        >
          <ICONS.referrers size={16} strokeWidth={1.5} aria-hidden="true" />
          Switch role (prototype)
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onSignOut();
          }}
          className="flex h-10 items-center gap-2 rounded-control px-2 text-left text-base text-ink hover:bg-panel"
        >
          <ICONS.logout size={16} strokeWidth={1.5} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </Popover>
  );
}

function SideLink({ item, active, compact = false, badge = 0 }: { item: NavItem; active: boolean; compact?: boolean; badge?: number }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink
      to={item.to}
      end={item.match === 'exact'}
      aria-label={compact ? item.label : undefined}
      title={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-10 items-center gap-3 rounded-control px-3 text-base text-ink-muted hover:bg-panel hover:text-ink',
        active && 'bg-accent-subtle font-medium text-ink',
        compact && 'justify-center px-0',
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-pill bg-accent" /> : null}
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" className={active ? 'text-accent' : undefined} />
      <span className={cn(compact ? 'hidden' : 'hidden lg:inline')}>{item.label}</span>
      {badge > 0 ? (
        <span aria-label={`${badge} to send`} className={cn('tabular rounded-full bg-accent-subtle px-2 text-xs font-semibold text-ink', compact ? 'absolute right-1 top-1 px-1' : 'ml-auto')}>
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink
      to={item.to}
      end={item.match === 'exact'}
      aria-current={active ? 'page' : undefined}
      className={cn('flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium text-ink-muted', active && 'text-accent')}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

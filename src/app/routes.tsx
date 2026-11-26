import { createBrowserRouter, Link } from 'react-router-dom';
import {
  DashboardPage,
  ImportPage,
  InboxPage,
  NewReferralPage,
  NoticesPage,
  ReferralDetailPage,
  ReferralFullPage,
  DoNotContactPage,
  ReferralsPage,
  ReferrerDetailPage,
  ReferrersPage,
  SettingsPage,
  TodayPage,
} from '@/features';
import { EmptyState } from '@/components/ui/surfaces';
import { AppShell } from './AppShell';
import { RequireAuth, RequireRole } from './guards';
import { LoginPage } from './LoginPage';

/**
 * Route table. Paths are opaque: no patient data in URLs or titles.
 * Manager-only routes are wrapped in RequireRole. The shell is wrapped in RequireAuth.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'referrals', element: <ReferralsPage /> },
      { path: 'referrals/new', element: <NewReferralPage /> },
      { path: 'referrals/:id', element: <ReferralDetailPage /> },
      { path: 'referrals/:id/full', element: <ReferralFullPage /> },
      { path: 'do-not-contact', element: <DoNotContactPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'notices', element: <NoticesPage /> },
      { path: 'referrers', element: <ReferrersPage /> },
      { path: 'referrers/:id', element: <ReferrerDetailPage /> },
      {
        path: 'dashboard',
        element: (
          <RequireRole roles={['manager']}>
            <DashboardPage />
          </RequireRole>
        ),
      },
      {
        path: 'import',
        element: (
          <RequireRole roles={['manager']}>
            <ImportPage />
          </RequireRole>
        ),
      },
      {
        path: 'settings',
        element: (
          <RequireRole roles={['manager']}>
            <SettingsPage />
          </RequireRole>
        ),
      },
    ],
  },
  {
    path: '*',
    element: (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
        <EmptyState
          icon="file"
          title="This page could not be found"
          description={<Link to="/" className="text-accent underline underline-offset-4">Go to Today</Link>}
        />
      </div>
    ),
  },
]);

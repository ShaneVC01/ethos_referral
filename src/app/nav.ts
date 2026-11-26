import type { StaffRole } from '@/domain';
import type { UiIconName } from '@/components/ui/icons';

export type NavGroup = 'Work' | 'Insights' | 'Admin';

export interface NavItem {
  to: string;
  label: string;
  icon: UiIconName;
  roles: StaffRole[];
  /** Sidebar section. Phone bottom nav and More sheet use the same list. */
  group: NavGroup;
  /** Shown in the phone bottom nav (4 items maximum). The rest live under the More sheet. */
  bottom?: boolean;
  /** Matches sub-routes too, for example /referrals/123 keeps All referrals active. */
  match?: 'exact' | 'prefix';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Work queue', icon: 'calendar', roles: ['manager', 'agent'], group: 'Work', bottom: true, match: 'exact' },
  { to: '/referrals', label: 'All referrals', icon: 'referrals', roles: ['manager', 'agent'], group: 'Work', bottom: true, match: 'prefix' },
  { to: '/referrals/new', label: 'New referral', icon: 'plus', roles: ['manager', 'agent'], group: 'Work', bottom: true, match: 'exact' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', roles: ['manager', 'agent'], group: 'Work', bottom: true, match: 'prefix' },
  { to: '/notices', label: 'Referrer notices', icon: 'mail', roles: ['manager', 'agent'], group: 'Work', match: 'prefix' },
  { to: '/import', label: 'Import', icon: 'upload', roles: ['manager'], group: 'Work', match: 'prefix' },
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['manager'], group: 'Insights', match: 'prefix' },
  { to: '/referrers', label: 'Referrers', icon: 'referrers', roles: ['manager', 'agent'], group: 'Insights', match: 'prefix' },
  { to: '/do-not-contact', label: 'Do not contact', icon: 'ban', roles: ['manager', 'agent'], group: 'Insights', match: 'prefix' },
  { to: '/settings', label: 'Settings', icon: 'settings', roles: ['manager'], group: 'Admin', match: 'prefix' },
];

export const NAV_GROUPS: NavGroup[] = ['Work', 'Insights', 'Admin'];

export function navForRole(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

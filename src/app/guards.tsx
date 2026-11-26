import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { StaffRole } from '@/domain';
import { hasRole, useAuth } from './auth';

/** Sends signed-out visitors to /login and remembers where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Shows the page only to the listed roles. Others see a plain message, never a flash of content. */
export function RequireRole({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!hasRole(user, roles)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold text-ink">This page is for managers</p>
        <p className="text-base text-ink-muted">Ask a manager if you need access to this area.</p>
      </div>
    );
  }
  return <>{children}</>;
}

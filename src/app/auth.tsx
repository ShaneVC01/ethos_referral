import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SessionUser, StaffRole } from '@/domain';

/**
 * Prototype sign-in. A staff picker plus a role switch (Manager or Agent). No credentials.
 * The guard shape is final: Supabase Auth replaces `signIn` and the session source later.
 * The session is kept in sessionStorage as a per-viewer convenience, wrapped in try/catch.
 */
const SESSION_KEY = 'ethos.referrals.session';

interface AuthContextValue {
  user: SessionUser | null;
  signIn: (user: SessionUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeSession(user: SessionUser | null): void {
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Private windows and blocked storage: the session simply does not persist.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => readSession());

  const signIn = useCallback((next: SessionUser) => {
    writeSession(next);
    setUser(next);
  }, []);

  const signOut = useCallback(() => {
    writeSession(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function hasRole(user: SessionUser | null, roles: StaffRole[]): boolean {
  return !!user && roles.includes(user.role);
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  manager: 'Manager',
  agent: 'Agent',
};

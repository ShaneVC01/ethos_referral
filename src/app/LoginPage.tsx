import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { STAFF_ROLES, type StaffRole } from '@/domain';
import { useStaff } from '@/data/hooks';
import { Button } from '@/components/ui/button';
import { Field, RadioGroup, Select } from '@/components/ui/forms';
import { Panel } from '@/components/ui/surfaces';
import { useAuth, ROLE_LABELS } from './auth';

/**
 * Prototype sign-in: pick a staff member and a role. No password yet, so this is not a security boundary.
 * Supabase Auth replaces this screen later.
 */
export function LoginPage() {
  const { user, signIn } = useAuth();
  const staff = useStaff();
  const navigate = useNavigate();
  const location = useLocation();
  const [staffId, setStaffId] = useState<string>('');
  const [role, setRole] = useState<StaffRole>('agent');
  const [error, setError] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) {
    // Already signed in: go straight to where the user was headed.
    return <Navigate to={from} replace />;
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const person = staff.data?.find((s) => s.id === staffId);
    if (!person) {
      setError('Choose your name from the list to continue.');
      return;
    }
    signIn({ id: person.id, name: person.name, role, initials: person.initials });
    navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas p-4 safe-top safe-bottom">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-12 items-center rounded-control bg-white px-3 shadow-card">
            <img src="/brand/ethos-logo.png" alt="Ethos Orthodontics" className="h-8 w-auto" />
          </span>
          <h1 className="text-xl font-semibold text-ink">Ethos Referrals</h1>
        </div>
        <Panel title="Sign in" description="Prototype sign-in. Choose who you are and your role.">
          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <Field label="Your name" error={error ?? undefined}>
              <Select
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  setError(null);
                }}
                disabled={staff.isLoading}
              >
                <option value="">{staff.isLoading ? 'Loading staff' : 'Choose your name'}</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <RadioGroup
              label="Role"
              name="role"
              layout="row"
              value={role}
              onValueChange={(v) => setRole(v as StaffRole)}
              options={STAFF_ROLES.map((r) => ({
                value: r,
                label: ROLE_LABELS[r],
                description: r === 'manager' ? 'Reports, import and settings' : 'Queue, referrals and referrers',
              }))}
            />
            <Button type="submit" size="lg" className="w-full">
              Sign in
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

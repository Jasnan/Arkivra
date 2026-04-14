import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();

  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProfileName(sessionData?.user.name ?? '');
    setProfileEmail(sessionData?.user.email ?? '');
  }, [sessionData?.user.email, sessionData?.user.name]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.updateUser({
        name: profileName.trim() || undefined,
      });

      if (error) {
        throw new Error(error.message ?? 'Could not update your profile.');
      }
    },
    onSuccess: async () => {
      setStatusMessage('Profile updated.');
      setErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update your profile.');
      setStatusMessage(null);
    },
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changeEmail({
        newEmail: profileEmail.trim(),
        callbackURL: '/settings',
      });

      if (error) {
        throw new Error(error.message ?? 'Could not start email change.');
      }
    },
    onSuccess: () => {
      setStatusMessage('Email change started. Check your inbox to confirm the new address.');
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not start email change.');
      setStatusMessage(null);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword: nextPassword,
      });

      if (error) {
        throw new Error(error.message ?? 'Could not change your password.');
      }
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNextPassword('');
      setStatusMessage('Password updated.');
      setErrorMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not change your password.');
      setStatusMessage(null);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();

      if (error) {
        throw new Error(error.message ?? 'Could not sign out.');
      }
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign out.');
      setStatusMessage(null);
    },
  });

  if (sessionPending) {
    return <p className="text-sm text-muted-foreground">Loading your account…</p>;
  }

  return (
    <section className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">Manage your account profile, password, and security preferences.</p>
        </div>
        {meQuery.data?.isGlobalAdmin ? (
          <Link to="/admin" className="text-sm font-medium text-primary hover:underline">Open admin panel</Link>
        ) : null}
      </div>

      {statusMessage ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">{statusMessage}</p> : null}
      {errorMessage ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Profile</h3>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                setStatusMessage(null);
                setErrorMessage(null);
                profileMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <label htmlFor="settings-name" className="text-sm font-medium">Name</label>
                <input
                  id="settings-name"
                  value={profileName}
                  onChange={event => setProfileName(event.target.value)}
                  className={inputClassName}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="settings-email" className="text-sm font-medium">Email</label>
                <input
                  id="settings-email"
                  type="email"
                  value={profileEmail}
                  onChange={event => setProfileEmail(event.target.value)}
                  className={inputClassName}
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? 'Saving…' : 'Save profile'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={emailMutation.isPending || profileEmail.trim() === (sessionData?.user.email ?? '')}
                  onClick={() => {
                    setStatusMessage(null);
                    setErrorMessage(null);
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending…' : 'Change email'}
                </Button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Password</h3>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                setStatusMessage(null);
                setErrorMessage(null);
                passwordMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <label htmlFor="settings-current-password" className="text-sm font-medium">Current password</label>
                <input
                  id="settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  className={inputClassName}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="settings-new-password" className="text-sm font-medium">New password</label>
                <input
                  id="settings-new-password"
                  type="password"
                  value={nextPassword}
                  onChange={event => setNextPassword(event.target.value)}
                  className={inputClassName}
                />
              </div>
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Updating…' : 'Change password'}
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Security</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd className="font-medium">{sessionData?.user.email ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email verified</dt>
                <dd className="font-medium">{sessionData?.user.emailVerified ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Two-factor authentication</dt>
                <dd className="font-medium">{sessionData?.user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Session id</dt>
                <dd className="font-mono text-xs">{meQuery.data?.sessionId ?? 'Loading…'}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/two-factor/setup" className="text-sm font-medium text-primary hover:underline">
                Manage 2FA
              </Link>
              <Link to="/request-password-reset" className="text-sm font-medium text-primary hover:underline">
                Send reset email
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Access</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {meQuery.data?.isGlobalAdmin
                ? 'This account has global admin access for the Arkivra installation.'
                : 'This account does not have global admin access.'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              disabled={signOutMutation.isPending}
              onClick={() => {
                setStatusMessage(null);
                setErrorMessage(null);
                signOutMutation.mutate();
              }}
            >
              {signOutMutation.isPending ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

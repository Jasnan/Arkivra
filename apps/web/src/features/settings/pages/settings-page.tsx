import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageIntro, StatCard, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import { authClient } from '@/lib/auth-client';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isGlobalAdmin = meQuery.data?.isGlobalAdmin === true;

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
    return <p className="text-sm text-muted-foreground">Loading your account...</p>;
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Identity & Access"
        title="Account settings"
        description="Manage your profile, email, password, and session security without leaving the vault workspace."
        actions={isGlobalAdmin ? <Link to="/admin" className="vault-link">Open admin panel</Link> : undefined}
      />

      {(statusMessage || errorMessage) ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Signed in as"
          value={sessionData?.user.email ?? 'Unknown'}
          meta="This is the active account for the current session."
          icon={<MailCheck className="size-5" />}
          className="md:col-span-2"
        />
        <StatCard
          label="Two-factor"
          value={sessionData?.user.twoFactorEnabled ? 'Enabled' : 'Off'}
          meta={sessionData?.user.twoFactorEnabled ? 'A second factor is protecting this account.' : 'Set up 2FA to strengthen account security.'}
          icon={<ShieldCheck className="size-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Profile</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Identity details</h2>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                setStatusMessage(null);
                setErrorMessage(null);
                profileMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <label htmlFor="settings-name" className="vault-label">Name</label>
                <input
                  id="settings-name"
                  value={profileName}
                  onChange={event => setProfileName(event.target.value)}
                  className={vaultInputClassName}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="settings-email" className="vault-label">Email</label>
                <input
                  id="settings-email"
                  type="email"
                  value={profileEmail}
                  onChange={event => setProfileEmail(event.target.value)}
                  className={vaultInputClassName}
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? 'Saving...' : 'Save profile'}
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
                  {emailMutation.isPending ? 'Sending...' : 'Change email'}
                </Button>
              </div>
            </form>
          </SurfacePanel>

          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Credentials</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Password</h2>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                setStatusMessage(null);
                setErrorMessage(null);
                passwordMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <label htmlFor="settings-current-password" className="vault-label">Current password</label>
                <input
                  id="settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  className={vaultInputClassName}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="settings-new-password" className="vault-label">New password</label>
                <input
                  id="settings-new-password"
                  type="password"
                  value={nextPassword}
                  onChange={event => setNextPassword(event.target.value)}
                  className={vaultInputClassName}
                />
              </div>
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Updating...' : 'Change password'}
              </Button>
            </form>
          </SurfacePanel>
        </div>

        <div className="space-y-6">
          <SurfacePanel variant="soft" className="space-y-5">
            <div>
              <p className="vault-label">Security</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Security</h2>
            </div>

            <dl className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 size-4 text-primary" />
                <div>
                  <dt className="text-muted-foreground">Email verified</dt>
                  <dd className="font-medium text-foreground">{sessionData?.user.emailVerified ? 'Yes' : 'No'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 text-primary" />
                <div>
                  <dt className="text-muted-foreground">Two-factor authentication</dt>
                  <dd className="font-medium text-foreground">{sessionData?.user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</dd>
                </div>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3">
              <Link to="/two-factor/setup" className="vault-link">Manage 2FA</Link>
              <Link to="/request-password-reset" className="vault-link">Send reset email</Link>
            </div>
          </SurfacePanel>

          <SurfacePanel variant="strong" className="space-y-5">
            <div>
              <p className="vault-label text-primary-foreground/70">Access</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em]">
                Session role
              </h2>
            </div>

            <p className="text-sm leading-6 text-primary-foreground/80">
              {isGlobalAdmin
                ? 'This account has global admin access for the Arkivra installation.'
                : 'This account does not have global admin access, but it can still manage its own profile, email, and password here.'}
            </p>

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={signOutMutation.isPending}
              onClick={() => {
                setStatusMessage(null);
                setErrorMessage(null);
                signOutMutation.mutate();
              }}
            >
              <KeyRound className="size-4" />
              {signOutMutation.isPending ? 'Signing out...' : 'Sign out'}
            </Button>
          </SurfacePanel>
        </div>
      </div>
    </section>
  );
}

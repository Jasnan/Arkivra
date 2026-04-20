import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, KeyRound, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
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

  const panelClassName = 'flex h-full flex-col gap-6 rounded-[22px] bg-card p-5 sm:p-6 ring-1 ring-border/70 shadow-[0_10px_24px_rgba(19,27,46,0.06)]';
  const sectionTitleClassName = 'font-display text-[2.1rem] font-bold tracking-[-0.05em] text-foreground';
  const leftCardTitleClassName = 'font-display text-[1.95rem] font-bold tracking-[-0.04em] text-foreground';
  const fieldInputClassName = `${vaultInputClassName} h-12 rounded-[12px] bg-background shadow-[inset_0_1px_2px_rgba(19,27,46,0.04)]`;
  const primaryActionClassName = 'inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50';
  const secondaryActionClassName = 'inline-flex h-11 items-center justify-center rounded-[10px] border border-border/80 bg-background px-6 text-sm font-semibold text-foreground transition hover:bg-secondary/40 disabled:pointer-events-none disabled:opacity-50';
  const warningStatusClassName = 'inline-flex items-center gap-1 font-medium text-amber-600';
  const bodyLabelClassName = 'text-[0.96rem] text-muted-foreground';
  const bodyValueClassName = 'text-[0.96rem] font-medium text-foreground';
  const statusCopyClassName = 'text-[0.98rem] text-foreground';
  const rowHeadingClassName = 'text-[1.45rem] font-semibold tracking-[-0.02em] text-foreground';

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        title="Account settings"
        description="Manage your profile and security."
        actions={isGlobalAdmin ? <Link to="/admin" className="vault-link">Admin panel</Link> : undefined}
      />

      {(statusMessage || errorMessage) ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.3fr] xl:items-stretch">
        <div className="grid gap-6 xl:grid-rows-2 xl:min-h-full">
          <SurfacePanel className={`${panelClassName} xl:min-h-0`}>
            <div>
              <h2 className={leftCardTitleClassName}>Profile Information</h2>
            </div>

            <form
              className="flex h-full flex-col gap-5"
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
                  className={fieldInputClassName}
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
                  className={fieldInputClassName}
                  placeholder="you@example.com"
                />
              </div>
              <div className="mt-auto pt-2">
                <Button type="submit" disabled={profileMutation.isPending} className="w-full rounded-[10px]">
                  {profileMutation.isPending ? 'Saving...' : 'Update Profile'}
                </Button>
              </div>
            </form>
          </SurfacePanel>

          <SurfacePanel className={`${panelClassName} xl:min-h-0`}>
            <div>
              <h2 className={leftCardTitleClassName}>Account Status</h2>
            </div>

            <div className="space-y-4 text-[1.05rem]">
              <div className="flex items-center justify-between gap-4">
                <span className={bodyLabelClassName}>Signed in as:</span>
                <span className={bodyValueClassName}>{sessionData?.user.email ?? 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className={bodyLabelClassName}>Role</span>
                <span className={bodyValueClassName}>{isGlobalAdmin ? 'Admin access' : 'Member access'}</span>
              </div>

              <div className="mt-auto pt-4">
                <Button
                  type="button"
                  className="w-full rounded-[10px]"
                  disabled={signOutMutation.isPending}
                  onClick={() => {
                    setStatusMessage(null);
                    setErrorMessage(null);
                    signOutMutation.mutate();
                  }}
                >
                  <KeyRound className="size-4" />
                  {signOutMutation.isPending ? 'Signing out...' : 'Sign Out'}
                </Button>
              </div>
            </div>
          </SurfacePanel>
        </div>

        <SurfacePanel className={`${panelClassName} xl:h-full`}>
          <div>
            <h2 className={sectionTitleClassName}>Security &amp; Protection</h2>
          </div>

          <div className="rounded-[16px] border border-amber-300/70 bg-amber-50 px-5 py-4 text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-lg font-semibold">Enhance your security</p>
                <p className="max-w-2xl text-sm leading-6 text-amber-900/90">
                  Improve your account protection by enabling Two-factor authentication (2FA) and completing email verification.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-0">
            <div className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
              <div className="space-y-1">
                <h3 className={rowHeadingClassName}>Two-factor authentication (2FA)</h3>
                <p className={statusCopyClassName}>
                  Status:{' '}
                  <span className={warningStatusClassName}>
                    {sessionData?.user.twoFactorEnabled ? 'Enabled' : 'Off'}
                    {!sessionData?.user.twoFactorEnabled ? <AlertTriangle className="size-4" /> : null}
                  </span>
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Link to="/two-factor/setup" className={primaryActionClassName}>
                  {sessionData?.user.twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[10px]"
                  disabled={emailMutation.isPending}
                  onClick={() => {
                    setStatusMessage(null);
                    setErrorMessage(null);
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending...' : 'Send verification email'}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border/70 py-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
              <div className="space-y-1">
                <h3 className={rowHeadingClassName}>Email verification</h3>
                <p className={statusCopyClassName}>
                  Status:{' '}
                  <span className={warningStatusClassName}>
                    {sessionData?.user.emailVerified ? 'Verified' : 'Unverified'}
                    {!sessionData?.user.emailVerified ? <AlertTriangle className="size-4" /> : null}
                  </span>
                </p>
              </div>
              <div className="flex justify-start md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[260px] rounded-[10px]"
                  disabled={emailMutation.isPending}
                  onClick={() => {
                    setStatusMessage(null);
                    setErrorMessage(null);
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending...' : 'Verify Now'}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border/70 pt-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
              <div className="space-y-1">
                <h3 className={rowHeadingClassName}>Password</h3>
                <p className={bodyLabelClassName}>Last changed: Never</p>
              </div>
              <div className="flex justify-start md:justify-end">
                <Link to="/request-password-reset" className={`${secondaryActionClassName} min-w-[260px]`}>
                  Change Password
                </Link>
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </section>
  );
}

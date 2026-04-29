import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, KeyRound, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageIntro, SurfacePanel } from '@/components/layout/vault-ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SaveButton } from '@/components/ui/action-buttons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import { authClient } from '@/lib/auth-client';

function SecurityStatusBadge({
  children,
  tone = 'warning',
}: {
  children: ReactNode;
  tone?: 'warning' | 'positive';
}) {
  return (
    <Badge
      variant="secondary"
      className={
        tone === 'positive'
          ? 'gap-1.5 bg-emerald-100 text-emerald-900'
          : 'gap-1.5 bg-amber-100 text-amber-900'
      }
    >
      {children}
    </Badge>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isGlobalAdmin = meQuery.data?.isGlobalAdmin === true;

  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const profileName = profileDraft?.name ?? sessionData?.user.name ?? '';
  const profileEmail = profileDraft?.email ?? sessionData?.user.email ?? '';

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
      toast.success('Profile updated.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update your profile.');
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
      toast.success('Email change started. Check your inbox to confirm the new address.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not start email change.');
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
      toast.error(error instanceof Error ? error.message : 'Could not sign out.');
    },
  });

  if (sessionPending) {
    return <p className="text-sm text-muted-foreground">Loading your account...</p>;
  }

  const panelClassName =
    'flex h-full flex-col gap-5 rounded-lg border border-border/70 bg-background p-5';
  const bodyLabelClassName = 'text-sm text-muted-foreground';
  const bodyValueClassName = 'text-sm font-medium text-foreground';
  const securityActionLinkClassName =
    'inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-95';
  const outlineActionLinkClassName =
    'inline-flex h-10 min-w-[260px] items-center justify-center rounded-lg border border-border/80 bg-background px-5 text-sm font-semibold text-foreground transition hover:bg-secondary/40';

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        title="Account settings"
        description="Manage your profile and security."
        actions={
          isGlobalAdmin ? (
            <Link to="/admin" className="vault-link">
              Admin panel
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.3fr] xl:items-stretch">
        <div className="grid gap-6 xl:grid-rows-2 xl:min-h-full">
          <SurfacePanel className={`${panelClassName} xl:min-h-0`}>
            <div className="space-y-1">
              <CardTitle className="text-lg">Profile Information</CardTitle>
              <CardDescription>Keep your basic account details up to date.</CardDescription>
            </div>

            <form
              className="flex h-full flex-col gap-5"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                profileMutation.mutate();
              }}
            >
              <Field>
                <FieldLabel htmlFor="settings-name">Name</FieldLabel>
                <Input
                  id="settings-name"
                  value={profileName}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      name: event.target.value,
                      email: current?.email ?? sessionData?.user.email ?? '',
                    }))
                  }
                  placeholder="Your name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-email">Email</FieldLabel>
                <Input
                  id="settings-email"
                  type="email"
                  value={profileEmail}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      name: current?.name ?? sessionData?.user.name ?? '',
                      email: event.target.value,
                    }))
                  }
                  placeholder="you@example.com"
                />
              </Field>
              <div className="mt-auto pt-2">
                <SaveButton type="submit" disabled={profileMutation.isPending} className="w-full">
                  {profileMutation.isPending ? 'Saving...' : 'Save changes'}
                </SaveButton>
              </div>
            </form>
          </SurfacePanel>

          <SurfacePanel className={`${panelClassName} xl:min-h-0`}>
            <div className="space-y-1">
              <CardTitle className="text-lg">Account Status</CardTitle>
              <CardDescription>Quick account details for your current session.</CardDescription>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className={bodyLabelClassName}>Signed in as:</span>
                <span className={bodyValueClassName}>{sessionData?.user.email ?? 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className={bodyLabelClassName}>Role</span>
                <span className={bodyValueClassName}>
                  {isGlobalAdmin ? 'Admin access' : 'Member access'}
                </span>
              </div>

              <div className="mt-auto pt-4">
                <Button
                  type="button"
                  className="w-full"
                  disabled={signOutMutation.isPending}
                  onClick={() => {
                    signOutMutation.mutate();
                  }}
                >
                  <KeyRound className="size-4" />
                  {signOutMutation.isPending ? 'Signing out...' : 'Sign out'}
                </Button>
              </div>
            </div>
          </SurfacePanel>
        </div>

        <SurfacePanel className={`${panelClassName} xl:h-full`}>
          <div className="space-y-1">
            <CardTitle>Security &amp; Protection</CardTitle>
            <CardDescription>Review the settings that protect your account access.</CardDescription>
          </div>

          <Alert className="flex items-start gap-3 border-amber-300/70 bg-amber-50 text-amber-950">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <AlertTitle>Enhance your security</AlertTitle>
              <AlertDescription className="max-w-2xl text-amber-900/90">
                Improve your account protection by enabling Two-factor authentication (2FA) and
                completing email verification.
              </AlertDescription>
            </div>
          </Alert>

          <div className="space-y-0">
            <div className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
              <div className="space-y-1">
                <CardTitle className="text-base">Two-factor authentication (2FA)</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                  <span>Status:</span>
                  <SecurityStatusBadge
                    tone={sessionData?.user.twoFactorEnabled ? 'positive' : 'warning'}
                  >
                    {sessionData?.user.twoFactorEnabled ? 'Enabled' : 'Off'}
                    {!sessionData?.user.twoFactorEnabled ? <AlertTriangle className="size-4" /> : null}
                  </SecurityStatusBadge>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Link to="/two-factor/setup" className={securityActionLinkClassName}>
                  {sessionData?.user.twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg"
                  disabled={emailMutation.isPending}
                  onClick={() => {
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending...' : 'Send verification email'}
                </Button>
              </div>
            </div>

            <Separator />
            <div className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
              <div className="space-y-1">
                <CardTitle className="text-base">Email verification</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                  <span>Status:</span>
                  <SecurityStatusBadge
                    tone={sessionData?.user.emailVerified ? 'positive' : 'warning'}
                  >
                    {sessionData?.user.emailVerified ? 'Verified' : 'Unverified'}
                    {!sessionData?.user.emailVerified ? <AlertTriangle className="size-4" /> : null}
                  </SecurityStatusBadge>
                </div>
              </div>
              <div className="flex justify-start md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[260px] rounded-lg"
                  disabled={emailMutation.isPending}
                  onClick={() => {
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending...' : 'Verify now'}
                </Button>
              </div>
            </div>

            <Separator />
            <div className="grid gap-4 pt-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
              <div className="space-y-1">
                <CardTitle className="text-base">Password</CardTitle>
                <p className={bodyLabelClassName}>Last changed: Never</p>
              </div>
              <div className="flex justify-start md:justify-end">
                <Link to="/request-password-reset" className={outlineActionLinkClassName}>
                  Change password
                </Link>
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </section>
  );
}

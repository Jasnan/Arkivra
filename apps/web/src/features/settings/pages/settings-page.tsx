import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
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
      color={tone === 'positive' ? 'status.success' : 'status.warning'}
      bg={tone === 'positive' ? 'status.successSubtle' : 'status.warningSubtle'}
      style={{ gap: '0.375rem' }}
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
    return <Text textStyle="metadata">Loading your account...</Text>;
  }

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        title="Account settings"
        description="Manage your profile and security."
        actions={
          isGlobalAdmin ? (
            <Link to="/admin" style={{ color: 'var(--chakra-colors-accent-default)', fontWeight: 600, fontSize: '0.875rem' }}>
              Admin panel
            </Link>
          ) : undefined
        }
      />
      <Grid gap="6" templateColumns={{ base: '1fr', xl: '0.8fr 1.3fr' }} alignItems="stretch">
        <Grid gap="6" templateRows={{ xl: 'repeat(2, minmax(0, 1fr))' }} minH={{ xl: 'full' }}>
          <SurfacePanel display="flex" h="full" minH={{ xl: '0' }} flexDirection="column" gap="5" p="5">
            <Stack gap="1">
              <CardTitle fontSize="lg">Profile Information</CardTitle>
              <CardDescription>Keep your basic account details up to date.</CardDescription>
            </Stack>

            <chakra.form
              h="100%"
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
              <Box mt="auto" pt="2">
                <SaveButton type="submit" disabled={profileMutation.isPending} w="100%">
                  {profileMutation.isPending ? 'Saving...' : 'Save changes'}
                </SaveButton>
              </Box>
            </chakra.form>
          </SurfacePanel>

          <SurfacePanel display="flex" h="full" minH={{ xl: '0' }} flexDirection="column" gap="5" p="5">
            <Stack gap="1">
              <CardTitle fontSize="lg">Account Status</CardTitle>
              <CardDescription>Quick account details for your current session.</CardDescription>
            </Stack>

            <Stack gap="4" fontSize="sm">
              <Flex align="center" justify="space-between" gap="4">
                <Text color="text.muted">Signed in as:</Text>
                <Text fontWeight="medium" color="text.default">{sessionData?.user.email ?? 'Unknown'}</Text>
              </Flex>
              <Flex align="center" justify="space-between" gap="4">
                <Text color="text.muted">Role</Text>
                <Text fontWeight="medium" color="text.default">
                  {isGlobalAdmin ? 'Admin access' : 'Member access'}
                </Text>
              </Flex>

              <Box mt="auto" pt="4">
                <Button
                  type="button"
                  w="100%"
                  disabled={signOutMutation.isPending}
                  onClick={() => {
                    signOutMutation.mutate();
                  }}
                >
                  <KeyRound size={16} />
                  {signOutMutation.isPending ? 'Signing out...' : 'Sign out'}
                </Button>
              </Box>
            </Stack>
          </SurfacePanel>
        </Grid>

        <SurfacePanel display="flex" h={{ xl: 'full' }} flexDirection="column" gap="5" p="5">
          <Stack gap="1">
            <CardTitle>Security &amp; Protection</CardTitle>
            <CardDescription>Review the settings that protect your account access.</CardDescription>
          </Stack>

          <Alert
            display="flex"
            alignItems="flex-start"
            gap="3"
            borderColor="status.warning/70"
            bg="status.warningSubtle"
            color="status.warning"
          >
            <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
            <Stack gap="1">
              <AlertTitle>Enhance your security</AlertTitle>
              <AlertDescription color="status.warning">
                Improve your account protection by enabling Two-factor authentication (2FA) and
                completing email verification.
              </AlertDescription>
            </Stack>
          </Alert>

          <Stack gap="0">
            <Grid gap="4" py="5" templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) 260px' }} alignItems="center">
              <Stack gap="1">
                <CardTitle fontSize="md">Two-factor authentication (2FA)</CardTitle>
                <Flex flexWrap="wrap" align="center" gap="2" fontSize="sm" color="text.default">
                  <Text as="span">Status:</Text>
                  <SecurityStatusBadge
                    tone={sessionData?.user.twoFactorEnabled ? 'positive' : 'warning'}
                  >
                    {sessionData?.user.twoFactorEnabled ? 'Enabled' : 'Off'}
                    {!sessionData?.user.twoFactorEnabled ? <AlertTriangle size={16} /> : null}
                  </SecurityStatusBadge>
                </Flex>
              </Stack>
              <Stack gap="3">
                <Link
                  to="/two-factor/setup"
                  style={{
                    display: 'inline-flex',
                    height: '2.5rem',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '0.5rem',
                    backgroundColor: 'var(--chakra-colors-accent-default)',
                    padding: '0 1.25rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--chakra-colors-text-inverse)',
                  }}
                >
                  {sessionData?.user.twoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  rounded="lg"
                  disabled={emailMutation.isPending}
                  onClick={() => {
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending...' : 'Send verification email'}
                </Button>
              </Stack>
            </Grid>

            <Separator />
            <Grid gap="4" py="5" templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) 260px' }} alignItems="center">
              <Stack gap="1">
                <CardTitle fontSize="md">Email verification</CardTitle>
                <Flex flexWrap="wrap" align="center" gap="2" fontSize="sm" color="text.default">
                  <Text as="span">Status:</Text>
                  <SecurityStatusBadge
                    tone={sessionData?.user.emailVerified ? 'positive' : 'warning'}
                  >
                    {sessionData?.user.emailVerified ? 'Verified' : 'Unverified'}
                    {!sessionData?.user.emailVerified ? <AlertTriangle size={16} /> : null}
                  </SecurityStatusBadge>
                </Flex>
              </Stack>
              <Flex justify={{ base: 'flex-start', md: 'flex-end' }}>
                <Button
                  type="button"
                  variant="outline"
                  minW="260px"
                  rounded="lg"
                  disabled={emailMutation.isPending}
                  onClick={() => {
                    emailMutation.mutate();
                  }}
                >
                  {emailMutation.isPending ? 'Sending...' : 'Verify now'}
                </Button>
              </Flex>
            </Grid>

            <Separator />
            <Grid gap="4" pt="5" templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) 260px' }} alignItems="center">
              <Stack gap="1">
                <CardTitle fontSize="md">Password</CardTitle>
                <Text textStyle="metadata">Last changed: Never</Text>
              </Stack>
              <Flex justify={{ base: 'flex-start', md: 'flex-end' }}>
                <Link
                  to="/request-password-reset"
                  style={{
                    display: 'inline-flex',
                    height: '2.5rem',
                    minWidth: '260px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '0.5rem',
                    borderWidth: '1px',
                    borderColor: 'var(--chakra-colors-border-subtle)',
                    backgroundColor: 'var(--chakra-colors-surface-default)',
                    padding: '0 1.25rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--chakra-colors-text-default)',
                  }}
                >
                  Change password
                </Link>
              </Flex>
            </Grid>
          </Stack>
        </SurfacePanel>
      </Grid>
    </Stack>
  );
}

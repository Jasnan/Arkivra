import type { FormEvent } from 'react';
import { useState } from 'react';
import { Grid, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import type { MeResponse } from '@/features/me/me.types';
import { acceptEmailInvitation } from '@/features/invitations/invitations.api';
import { authClient } from '@/lib/auth-client';
import {
  KeyValueRows,
  SettingsPageFrame,
  SettingsSection,
  SettingsStatusBadge,
} from '../components/settings-ui';

interface SessionUserMetadata {
  createdAt?: string | Date | null;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Not available';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getProviderLabel(provider: string) {
  const labels: Record<string, string> = {
    credential: 'Local',
    github: 'GitHub',
    google: 'Google',
  };

  return labels[provider.toLowerCase()] ?? provider;
}

function getAccountTypeLabel(authMethods: MeResponse['authMethods'] | undefined) {
  if (!authMethods) return 'Not available';

  const providers = authMethods.oauthProviders.map(getProviderLabel);

  if (authMethods.hasPassword && providers.length > 0) {
    return `Local + ${providers.join(', ')}`;
  }

  if (authMethods.hasPassword) {
    return 'Local account';
  }

  if (providers.length > 0) {
    return `${providers.join(', ')} OAuth`;
  }

  return 'Unknown';
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isRoot = meQuery.data?.isRoot === true;
  const isEmailVerified = sessionData?.user.emailVerified === true;
  const accountCreatedAt = (sessionData?.user as SessionUserMetadata | undefined)?.createdAt;

  const [profileDraft, setProfileDraft] = useState<{ name: string } | null>(null);
  const [invitationId, setInvitationId] = useState('');
  const profileName = profileDraft?.name ?? sessionData?.user.name ?? '';
  const profileEmail = sessionData?.user.email ?? '';

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

  const acceptInvitationMutation = useMutation({
    mutationFn: acceptEmailInvitation,
    onSuccess: async () => {
      toast.success('Invitation accepted.');
      setInvitationId('');
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not accept invitation.');
    },
  });

  if (sessionPending) {
    return <Text textStyle="sm">Loading your account...</Text>;
  }

  return (
    <SettingsPageFrame title="Account">
      <SettingsSection
        title="Profile information"
        description="Update your personal details."
        actions={
          <Button type="submit" form="settings-profile-form" size="sm" disabled={profileMutation.isPending}>
            {profileMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        }
      >
        <chakra.form
          id="settings-profile-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            profileMutation.mutate();
          }}
        >
          <Grid gap="4" templateColumns={{ base: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }}>
            <Field>
              <FieldLabel htmlFor="settings-name">Name</FieldLabel>
              <Input
                id="settings-name"
                mt="2"
                value={profileName}
                onChange={(event) => setProfileDraft({ name: event.target.value })}
                placeholder="Your name"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-email">Email</FieldLabel>
              <Input
                id="settings-email"
                mt="2"
                type="email"
                value={profileEmail}
                readOnly
                disabled
                placeholder="you@example.com"
              />
              <Text mt="2" textStyle="xs" color="fg.muted">
                Email changes are managed from Security.
              </Text>
            </Field>
          </Grid>
        </chakra.form>
      </SettingsSection>

      <SettingsSection title="Account status" description="Overview of your account.">
        <KeyValueRows
          rows={[
            { label: 'Signed in as', value: profileEmail || 'Unknown' },
            { label: 'Account type', value: getAccountTypeLabel(meQuery.data?.authMethods) },
            { label: 'System role', value: isRoot ? 'Root' : 'Member' },
            { label: 'Vault creation', value: meQuery.data?.canCreateVault ? 'Allowed' : 'Requires root approval' },
            {
              label: 'Email verification',
              value: (
                <SettingsStatusBadge tone={isEmailVerified ? 'verified' : 'warning'}>
                  {isEmailVerified ? 'Verified' : 'Unverified'}
                </SettingsStatusBadge>
              ),
            },
            { label: 'Account created', value: formatDateTime(accountCreatedAt) },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Invitations" description="Accept a pending email invitation for this account.">
        <chakra.form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            acceptInvitationMutation.mutate({
              invitationId: invitationId.trim() || undefined,
              email: profileEmail || undefined,
            });
          }}
        >
          <Grid gap="4" templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) auto' }} alignItems="end">
            <Field>
              <FieldLabel htmlFor="settings-invitation-token">Invitation token</FieldLabel>
              <Input
                id="settings-invitation-token"
                mt="2"
                value={invitationId}
                onChange={(event) => setInvitationId(event.target.value)}
                placeholder="invite_..."
              />
            </Field>
            <Button type="submit" disabled={acceptInvitationMutation.isPending}>
              {acceptInvitationMutation.isPending ? 'Accepting...' : 'Accept invitation'}
            </Button>
          </Grid>
        </chakra.form>
      </SettingsSection>
    </SettingsPageFrame>
  );
}

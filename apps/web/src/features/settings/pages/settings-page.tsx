import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Box, Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import type { MeResponse } from '@/features/me/me.types';
import { authClient } from '@/lib/auth-client';
import { formatShortDateTime } from '@/lib/localization';
import {
  SettingsPageFrame,
  SettingsStatusBadge,
} from '../components/settings-ui';

interface SessionUserMetadata {
  createdAt?: string | Date | null;
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

function AccountDetailRows({ children }: { children: ReactNode }) {
  return (
    <Stack gap="0" divideY="1px" divideColor="border.muted">
      {children}
    </Stack>
  );
}

function AccountDetailRow({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'flex-start' }}
      justify="space-between"
      gap={{ base: '1.5', md: '4' }}
      py="3"
    >
      <Text textStyle="sm" color="fg.muted">
        {label}
      </Text>
      <Stack gap="1.5" align={{ base: 'flex-start', md: 'flex-end' }} minW="0" textAlign={{ base: 'left', md: 'right' }}>
        <Box minW="0" fontSize="sm" fontWeight="medium" color="fg">
          {value}
        </Box>
        {note ? (
          <Box fontSize="xs" color="fg.subtle">
            {note}
          </Box>
        ) : null}
      </Stack>
    </Flex>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isAdmin = meQuery.data?.isAdmin === true;
  const isEmailVerified = sessionData?.user.emailVerified === true;
  const accountCreatedAt = (sessionData?.user as SessionUserMetadata | undefined)?.createdAt;

  const [profileDraft, setProfileDraft] = useState<{ name: string } | null>(null);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const profileName = profileDraft?.name ?? sessionData?.user.name ?? '';
  const profileEmail = sessionData?.user.email ?? '';

  const profileMutation = useMutation({
    mutationFn: async (nextName: string) => {
      const { error } = await authClient.updateUser({
        name: nextName.trim() || undefined,
      });

      if (error) {
        throw new Error(error.message ?? 'Could not update your profile.');
      }
    },
    onSuccess: async (_data, nextName) => {
      setProfileDraft({ name: nextName.trim() });
      setIsNameDialogOpen(false);
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

  if (sessionPending) {
    return <Text textStyle="sm">Loading your account...</Text>;
  }

  return (
    <SettingsPageFrame
      title="Account"
      description="View and manage your profile and account details."
      density="compact"
    >
      <Stack gap="4" maxW="4xl" pt="3">
        <Text as="h2" fontSize="md" fontWeight="semibold" color="fg">
          Account details
        </Text>

        <AccountDetailRows>
          <AccountDetailRow
            label="Name"
            value={(
              <HStack gap="2" justify={{ base: 'flex-start', md: 'flex-end' }} minW="0">
                <Text as="span" truncate>
                  {profileName || 'Not set'}
                </Text>
                <Button
                  type="button"
                  aria-label="Edit name"
                  title="Edit name"
                  size="icon"
                  variant="ghost"
                  h="7"
                  minH="7"
                  w="7"
                  color="fg.muted"
                  onClick={() => {
                    setNameDraft(profileName);
                    setIsNameDialogOpen(true);
                  }}
                >
                  <Pencil size={15} />
                </Button>
              </HStack>
            )}
          />
          <AccountDetailRow
            label="Email"
            value={profileEmail || 'Unknown'}
            note={(
              <HStack gap="1.5" justify={{ base: 'flex-start', md: 'flex-end' }}>
                <LockKeyhole size={13} />
                <Text as="span">Email changes are managed from Security.</Text>
              </HStack>
            )}
          />
          <AccountDetailRow label="Signed in as" value={profileEmail || 'Unknown'} />
          <AccountDetailRow label="Account type" value={getAccountTypeLabel(meQuery.data?.authMethods)} />
          <AccountDetailRow
            label="System role"
            value={(
              <SettingsStatusBadge tone={isAdmin ? 'enabled' : 'inactive'}>
                {isAdmin ? 'Admin' : 'Member'}
              </SettingsStatusBadge>
            )}
          />
          <AccountDetailRow label="Vault creation" value={meQuery.data?.canCreateVault ? 'Allowed' : 'Requires admin approval'} />
          <AccountDetailRow
            label="Email verification"
            value={(
              <SettingsStatusBadge tone={isEmailVerified ? 'verified' : 'warning'}>
                {isEmailVerified ? 'Verified' : 'Unverified'}
              </SettingsStatusBadge>
            )}
          />
          <AccountDetailRow label="Account created" value={formatShortDateTime(accountCreatedAt, { fallback: 'Not available' })} />
        </AccountDetailRows>
      </Stack>

      <Dialog
        open={isNameDialogOpen}
        onOpenChange={(open) => {
          setIsNameDialogOpen(open);
          if (open) {
            setNameDraft(profileName);
          }
        }}
      >
        <DialogContent maxW="24rem" w="calc(100vw - 2rem)">
          <chakra.form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              profileMutation.mutate(nameDraft);
            }}
          >
            <DialogHeader px="5" pt="5" pb="3">
              <DialogTitle>Edit name</DialogTitle>
              <DialogDescription>
                Update the display name shown on your Arkivra account.
              </DialogDescription>
            </DialogHeader>
            <DialogBody px="5" pb="4">
              <Field>
                <FieldLabel htmlFor="settings-name">Name</FieldLabel>
                <Input
                  id="settings-name"
                  mt="1.5"
                  autoComplete="name"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder="Your name"
                />
              </Field>
            </DialogBody>
            <DialogFooter px="5" pb="5" pt="0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsNameDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </chakra.form>
        </DialogContent>
      </Dialog>
    </SettingsPageFrame>
  );
}

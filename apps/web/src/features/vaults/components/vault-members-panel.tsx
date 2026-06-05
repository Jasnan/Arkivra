import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import { toast } from '@/components/ui/toaster-store';
import { SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { SaveButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addVaultMember,
  createVaultEmailInvitation,
  joinVaultAsAdmin,
  leaveVaultAsAdmin,
  removeVaultMember,
  transferVaultOwnership,
  updateVaultMember,
} from '@/features/vaults/vaults.api';
import {
  useVaultMembersQuery,
  vaultQueryKeys,
} from '@/features/vaults/vaults.queries';
import { formatAiAccess, formatVaultRole } from '@/features/vaults/components/vault-member-formatters';
import type { AiAccessLevel, VaultDetail, VaultMember, VaultRole } from '@/features/vaults/vaults.types';

const roleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const aiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'No AI access' },
  { value: 'document_chat', label: 'Document chat' },
  { value: 'full', label: 'Full AI access' },
];

function isRequestResponse<T extends object>(value: T | { request: unknown }): value is { request: unknown } {
  return 'request' in value;
}

function MemberAccessFields({
  role,
  aiAccessLevel,
  disabled,
  idPrefix,
  onRoleChange,
  onAiAccessLevelChange,
}: {
  idPrefix: string;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
  disabled?: boolean;
  onRoleChange: (role: VaultRole) => void;
  onAiAccessLevelChange: (level: AiAccessLevel) => void;
}) {
  return (
    <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-role`}>Vault role</FieldLabel>
        <Select
          value={role}
          onValueChange={(value) => onRoleChange(value as VaultRole)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-role`} className={vaultInputClassName}>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-ai-access`}>AI access</FieldLabel>
        <Select
          value={aiAccessLevel}
          onValueChange={(value) => onAiAccessLevelChange(value as AiAccessLevel)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-ai-access`} className={vaultInputClassName}>
            <SelectValue placeholder="Select AI access" />
          </SelectTrigger>
          <SelectContent>
            {aiAccessOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </Grid>
  );
}

export function VaultMembersPanel({
  vault,
  vaultId,
}: {
  vault: VaultDetail;
  vaultId: string;
}) {
  const queryClient = useQueryClient();
  const membersQuery = useVaultMembersQuery({ vaultId });
  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data?.members]);

  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<VaultRole>('viewer');
  const [inviteAiAccessLevel, setInviteAiAccessLevel] = useState<AiAccessLevel>('none');
  const [inviteEmail, setInviteEmail] = useState('');
  const [emailInviteRole, setEmailInviteRole] = useState<VaultRole>('viewer');
  const [emailInviteAiAccessLevel, setEmailInviteAiAccessLevel] = useState<AiAccessLevel>('none');
  const [memberDrafts, setMemberDrafts] = useState<Record<string, { role: VaultRole; aiAccessLevel: AiAccessLevel }>>({});
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [joinRole, setJoinRole] = useState<VaultRole>('owner');
  const [joinAiAccessLevel, setJoinAiAccessLevel] = useState<AiAccessLevel>('full');

  const ownerCandidates = useMemo(
    () => members.filter((member) => member.role !== 'owner'),
    [members],
  );

  const canManageMembers = vault.role === 'owner';
  const canManageVault = vault.role === 'owner';
  const isAdmin = vault.isAdmin === true;
  const isAdminOnly = isAdmin && vault.accessMode === 'admin';
  const isAdminParticipant = isAdmin && vault.isMember === true;

  async function invalidateVaultParticipation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) }),
    ]);
  }

  const inviteMutation = useMutation({
    mutationFn: addVaultMember,
    onSuccess: async (result) => {
      toast.success(
        isRequestResponse(result)
          ? 'Member access request queued for admin approval.'
          : 'Member added to vault.',
      );
      setInviteUserId('');
      setInviteRole('viewer');
      setInviteAiAccessLevel('none');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not add member.');
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: updateVaultMember,
    onSuccess: async (result) => {
      toast.success(
        isRequestResponse(result)
          ? 'Member access request queued for admin approval.'
          : 'Member access updated.',
      );
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update member.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeVaultMember,
    onSuccess: async () => {
      toast.success('Member removed from vault.');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove member.');
    },
  });

  const joinVaultMutation = useMutation({
    mutationFn: joinVaultAsAdmin,
    onSuccess: async () => {
      toast.success('You joined this vault.');
      setIsJoinDialogOpen(false);
      setJoinRole('owner');
      setJoinAiAccessLevel('full');
      await invalidateVaultParticipation();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not join vault.');
    },
  });
  const isJoinVaultFormDirty = joinRole !== 'owner' || joinAiAccessLevel !== 'full';
  const canDismissJoinVaultDialog = !isJoinVaultFormDirty && !joinVaultMutation.isPending;

  const leaveVaultMutation = useMutation({
    mutationFn: leaveVaultAsAdmin,
    onSuccess: async () => {
      toast.success('You left this vault. Administrative read-only access remains available.');
      await invalidateVaultParticipation();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not leave vault.');
    },
  });

  const transferMutation = useMutation({
    mutationFn: transferVaultOwnership,
    onSuccess: async (result) => {
      toast.success(
        isRequestResponse(result)
          ? 'Owner promotion request queued for admin approval.'
          : 'Ownership transferred.',
      );
      setTransferTargetUserId('');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not transfer ownership.');
    },
  });

  const emailInviteMutation = useMutation({
    mutationFn: createVaultEmailInvitation,
    onSuccess: ({ invitation }) => {
      toast.success(`Invitation created for ${invitation.email}.`);
      setInviteEmail('');
      setEmailInviteRole('viewer');
      setEmailInviteAiAccessLevel('none');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create invitation.');
    },
  });

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userId = inviteUserId.trim();
    if (!userId) {
      toast.warning('User ID is required.');
      return;
    }

    inviteMutation.mutate({
      vaultId,
      userId,
      role: inviteRole,
      aiAccessLevel: inviteAiAccessLevel,
    });
  }

  function handleEmailInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = inviteEmail.trim();
    if (!email) {
      toast.warning('Email is required.');
      return;
    }

    emailInviteMutation.mutate({
      vaultId,
      email,
      role: emailInviteRole,
      aiAccessLevel: emailInviteAiAccessLevel,
    });
  }

  function getMemberDraft(member: VaultMember) {
    return memberDrafts[member.userId] ?? {
      role: member.role,
      aiAccessLevel: member.aiAccessLevel,
    };
  }

  function updateMemberDraft(member: VaultMember, draft: Partial<{ role: VaultRole; aiAccessLevel: AiAccessLevel }>) {
    setMemberDrafts((current) => ({
      ...current,
      [member.userId]: {
        ...(current[member.userId] ?? {
          role: member.role,
          aiAccessLevel: member.aiAccessLevel,
        }),
        ...draft,
      },
    }));
  }

  return (
    <>
      <Grid gap="6" templateColumns={{ base: '1fr', xl: '1.1fr 0.9fr' }}>
        <Stack gap="6">
          <SurfacePanel display="flex" flexDirection="column" gap="5">
            <Box>
              <Text textStyle="label">Invite Member</Text>
              <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                Access onboarding
              </Text>
              <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                Add an existing user with a vault role and separate AI access.
              </Text>
            </Box>
            <chakra.form display="flex" flexDirection="column" gap="4" onSubmit={handleInvite}>
              <Field>
                <FieldLabel htmlFor="vault-invite-user-id">User ID</FieldLabel>
                <Input
                  id="vault-invite-user-id"
                  type="text"
                  value={inviteUserId}
                  onChange={(event) => setInviteUserId(event.target.value)}
                  placeholder="usr_..."
                  disabled={!canManageMembers}
                />
                <FieldDescription>Invite an existing Arkivra user by their user id.</FieldDescription>
              </Field>

              <MemberAccessFields
                idPrefix="vault-invite"
                role={inviteRole}
                aiAccessLevel={inviteAiAccessLevel}
                onRoleChange={setInviteRole}
                onAiAccessLevelChange={setInviteAiAccessLevel}
                disabled={!canManageMembers}
              />

              <Button type="submit" disabled={!canManageMembers || inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Adding...' : 'Add'}
              </Button>
            </chakra.form>
          </SurfacePanel>

          {isAdmin && canManageMembers ? (
            <SurfacePanel display="flex" flexDirection="column" gap="5">
              <Box>
                <Text textStyle="label">Email Invitation</Text>
                <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                  Invite by email
                </Text>
                <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                  Create an invitation for someone who may not have an Arkivra account yet.
                </Text>
              </Box>
              <chakra.form display="flex" flexDirection="column" gap="4" onSubmit={handleEmailInvite}>
                <Field>
                  <FieldLabel htmlFor="vault-invite-email">Email</FieldLabel>
                  <Input
                    id="vault-invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="person@example.com"
                  />
                </Field>

                <MemberAccessFields
                  idPrefix="vault-email-invite"
                  role={emailInviteRole}
                  aiAccessLevel={emailInviteAiAccessLevel}
                  onRoleChange={setEmailInviteRole}
                  onAiAccessLevelChange={setEmailInviteAiAccessLevel}
                />

                <Button type="submit" disabled={emailInviteMutation.isPending}>
                  {emailInviteMutation.isPending ? 'Sending...' : 'Send invite'}
                </Button>
              </chakra.form>
            </SurfacePanel>
          ) : null}

          <SurfacePanel display="flex" flexDirection="column" gap="5">
            <Box>
              <Text textStyle="label">Members & Access</Text>
              <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                Access roster
              </Text>
            </Box>

            {membersQuery.isLoading ? (
              <Text fontSize="sm" color="fg.muted">Loading members...</Text>
            ) : null}
            {membersQuery.isError ? (
              <Text fontSize="sm" color="fg.error">Unable to load members.</Text>
            ) : null}

            <Stack gap="4">
              {members.map((member) => {
                const draft = getMemberDraft(member);

                return (
                  <Box key={member.userId} rounded="lg" bg="bg.subtle" p="5">
                    <Flex
                      direction={{ base: 'column', sm: 'row' }}
                      align={{ base: 'stretch', sm: 'center' }}
                      justify={{ base: 'flex-start', sm: 'space-between' }}
                      gap="3"
                      mb="4"
                    >
                      <Box>
                        <Text fontSize="base" fontWeight="semibold" color="fg">
                          {member.name ?? member.email}
                        </Text>
                        <Text mt="2" fontSize="sm" color="fg.muted">
                          {member.userId} • {formatVaultRole(member.role)} • {formatAiAccess(member.aiAccessLevel)}
                        </Text>
                      </Box>
                      {member.role !== 'owner' ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canManageMembers || removeMemberMutation.isPending}
                          onClick={() =>
                            removeMemberMutation.mutate({ vaultId, memberUserId: member.userId })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </Flex>

                    <chakra.form
                      display="flex"
                      flexDirection="column"
                      gap="4"
                      onSubmit={(event: FormEvent<HTMLFormElement>) => {
                        event.preventDefault();
                        updateMemberMutation.mutate({
                          vaultId,
                          memberUserId: member.userId,
                          role: draft.role,
                          aiAccessLevel: draft.aiAccessLevel,
                        });
                      }}
                    >
                      <MemberAccessFields
                        idPrefix={member.userId}
                        role={draft.role}
                        aiAccessLevel={draft.aiAccessLevel}
                        disabled={!canManageMembers}
                        onRoleChange={(role) => updateMemberDraft(member, { role })}
                        onAiAccessLevelChange={(aiAccessLevel) => updateMemberDraft(member, { aiAccessLevel })}
                      />

                      <SaveButton
                        type="submit"
                        disabled={!canManageMembers || updateMemberMutation.isPending}
                      >
                        {updateMemberMutation.isPending ? 'Saving...' : 'Save'}
                      </SaveButton>
                    </chakra.form>
                  </Box>
                );
              })}
            </Stack>
          </SurfacePanel>
        </Stack>

        <Stack gap="6">
          {isAdminOnly ? (
            <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="5">
              <Box>
                <Text textStyle="label">Administrative Access</Text>
                <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                  Join this vault
                </Text>
                <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                  You can inspect this vault as an admin. Join it to become an explicit participant.
                </Text>
              </Box>
              <Button type="button" onClick={() => setIsJoinDialogOpen(true)}>
                Join
              </Button>
            </SurfacePanel>
          ) : null}

          {isAdminParticipant ? (
            <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="5">
              <Box>
                <Text textStyle="label">Participating Membership</Text>
                <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                  Leave this vault
                </Text>
                <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                  Remove your explicit membership and return to administrative read-only access.
                </Text>
              </Box>
              <Button
                type="button"
                variant="outline"
                disabled={leaveVaultMutation.isPending}
                onClick={() => leaveVaultMutation.mutate({ vaultId })}
              >
                {leaveVaultMutation.isPending ? 'Leaving...' : 'Leave vault'}
              </Button>
            </SurfacePanel>
          ) : null}

          <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="5">
            <Box>
              <Text textStyle="label">Transfer Ownership</Text>
              <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                Promote a member
              </Text>
              <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                Promote an existing member to owner when responsibility needs to change hands.
              </Text>
            </Box>
            <Stack gap="4">
              <Select
                value={transferTargetUserId || '__none__'}
                onValueChange={(value) =>
                  setTransferTargetUserId(value === '__none__' ? '' : value)
                }
                disabled={ownerCandidates.length === 0}
              >
                <SelectTrigger aria-label="Select member" className={vaultInputClassName}>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select member</SelectItem>
                  {ownerCandidates.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.name ?? member.email} ({member.userId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={
                  transferTargetUserId.length === 0 ||
                  transferMutation.isPending ||
                  !canManageVault
                }
                onClick={() => {
                  transferMutation.mutate({ vaultId, userId: transferTargetUserId });
                }}
              >
                <ArrowRightLeft size={16} />
                {transferMutation.isPending ? 'Transferring...' : 'Transfer ownership'}
              </Button>
            </Stack>
          </SurfacePanel>
        </Stack>
      </Grid>

      <ChakraDialog.Root
        open={isJoinDialogOpen}
        closeOnEscape={canDismissJoinVaultDialog}
        closeOnInteractOutside={canDismissJoinVaultDialog}
        onOpenChange={(event) => {
          if (!event.open && !joinVaultMutation.isPending) {
            setIsJoinDialogOpen(false);
          }
        }}
        size={{ mdDown: 'full', md: 'lg' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <chakra.form
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  joinVaultMutation.mutate({
                    vaultId,
                    role: joinRole,
                    aiAccessLevel: joinAiAccessLevel,
                  });
                }}
              >
                <ChakraDialog.Header>
                  <ChakraDialog.Title>Join vault</ChakraDialog.Title>
                  <ChakraDialog.CloseTrigger asChild>
                    <CloseButton size="sm" />
                  </ChakraDialog.CloseTrigger>
                </ChakraDialog.Header>
                <ChakraDialog.Body>
                  <Stack gap="4">
                    <Text fontSize="sm" lineHeight="6" color="fg.muted">
                      You are about to become an explicit participant of this vault. This enables collaborative actions and AI participation under your account.
                    </Text>
                    <MemberAccessFields
                      idPrefix="admin-join-vault"
                      role={joinRole}
                      aiAccessLevel={joinAiAccessLevel}
                      disabled={joinVaultMutation.isPending}
                      onRoleChange={setJoinRole}
                      onAiAccessLevelChange={setJoinAiAccessLevel}
                    />
                  </Stack>
                </ChakraDialog.Body>
                <ChakraDialog.Footer>
                  <ChakraDialog.ActionTrigger asChild>
                    <Button type="button" variant="outline" disabled={joinVaultMutation.isPending} onClick={() => setIsJoinDialogOpen(false)}>
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  <Button type="submit" disabled={joinVaultMutation.isPending}>
                    {joinVaultMutation.isPending ? 'Joining...' : 'Join'}
                  </Button>
                </ChakraDialog.Footer>
              </chakra.form>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>
    </>
  );
}

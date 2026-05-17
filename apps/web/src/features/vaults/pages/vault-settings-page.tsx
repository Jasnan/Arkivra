import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, ShieldCheck, Users, Vault } from 'lucide-react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import {
  PageIntro,
  StatCard,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import {
  DeleteButton,
  SaveButton,
} from '@/components/ui/action-buttons';
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
import { Textarea } from '@/components/ui/textarea';
import {
  addVaultMember,
  createVaultEmailInvitation,
  deleteVault,
  joinVaultAsRoot,
  leaveVaultAsRoot,
  removeVaultMember,
  renameVault,
  transferVaultOwnership,
  updateVaultMember,
} from '@/features/vaults/vaults.api';
import {
  useVaultMembersQuery,
  useVaultQuery,
  vaultQueryKeys,
} from '@/features/vaults/vaults.queries';
import type { AiAccessLevel, VaultMember, VaultRole } from '@/features/vaults/vaults.types';

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

function formatVaultRole(role: VaultRole | null | undefined, isRoot = false) {
  if (role === 'owner') return 'Owner';
  if (role === 'editor') return 'Editor';
  if (role === 'viewer') return 'Viewer';
  return isRoot ? 'Administrative Read-Only Access' : 'No membership';
}

function formatAiAccess(level: AiAccessLevel | null | undefined) {
  if (level === 'full') return 'Full AI access';
  if (level === 'document_chat') return 'Document chat';
  return 'No AI access';
}

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

export function VaultSettingsPage() {
  const params = useParams({ strict: false }) as { vaultId?: string };
  const vaultId = params.vaultId ?? '';

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const vaultQuery = useVaultQuery({ vaultId });
  const membersQuery = useVaultMembersQuery({ vaultId });

  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data?.members]);

  const [detailsDraft, setDetailsDraft] = useState<{
    vaultId: string;
    name: string;
    description: string;
  } | null>(null);
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
  const draftMatchesVault = detailsDraft?.vaultId === vaultId;
  const name = draftMatchesVault ? detailsDraft.name : vaultQuery.data?.vault.name ?? '';
  const description = draftMatchesVault
    ? detailsDraft.description
    : vaultQuery.data?.vault.description ?? '';

  const ownerCandidates = useMemo(
    () => members.filter((member) => member.role !== 'owner'),
    [members],
  );

  const canManageMembers = vaultQuery.data?.vault.role === 'owner';
  const canManageVault = vaultQuery.data?.vault.role === 'owner';
  const isRoot = vaultQuery.data?.vault.isRoot === true;
  const isRootAdminOnly = isRoot && vaultQuery.data?.vault.accessMode === 'admin';
  const isRootParticipant = isRoot && vaultQuery.data?.vault.isMember === true;

  async function invalidateVaultParticipation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) }),
    ]);
  }

  const renameMutation = useMutation({
    mutationFn: renameVault,
    onSuccess: async () => {
      toast.success('Vault details updated.');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update vault details.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVault,
    onSuccess: async (result) => {
      if (result && isRequestResponse(result)) {
        toast.success('Vault deletion request queued for root approval.');
        await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      navigate({ to: ROUTES.vaults });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete vault.');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: addVaultMember,
    onSuccess: async (result) => {
      toast.success(
        isRequestResponse(result)
          ? 'Member access request queued for root approval.'
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
          ? 'Member access request queued for root approval.'
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
    mutationFn: joinVaultAsRoot,
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

  const leaveVaultMutation = useMutation({
    mutationFn: leaveVaultAsRoot,
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
          ? 'Owner promotion request queued for root approval.'
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

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  if (vaultQuery.isLoading) {
    return <Text fontSize="sm" color="fg.muted">Loading vault settings...</Text>;
  }

  if (vaultQuery.isError || !vaultQuery.data) {
    return <Text fontSize="sm" color="fg.error">Unable to load vault settings.</Text>;
  }

  const vault = vaultQuery.data.vault;

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = name.trim() || vault.name;
    renameMutation.mutate({
      vaultId,
      name: normalizedName,
      description: description.trim() || null,
    });
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userId = inviteUserId.trim();
    if (!userId) {
      toast.error('User ID is required.');
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
      toast.error('Email is required.');
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
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Vault Governance"
        title="Vault settings"
        description={`${vault.name} • ${vault.id}`}
        actions={
            <Link to={ROUTES.vaultRoot(vaultId)} style={{ color: 'var(--chakra-colors-teal-solid)', fontWeight: 600, fontSize: '0.875rem' }}>
              Open documents
            </Link>
        }
      />
      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}>
        <StatCard
          label="Your role"
          value={formatVaultRole(vault.role, vault.isRoot)}
          meta={vault.accessMode === 'admin' ? 'Administrative read-only access. Membership is required to participate.' : 'Current vault membership role.'}
          icon={<ShieldCheck size={20} />}
        />
        <StatCard
          label="Members"
          value={members.length}
          meta="People currently attached to this vault."
          icon={<Users size={20} />}
        />
        <StatCard
          label="AI access"
          value={formatAiAccess(vault.aiAccessLevel)}
          meta={
            vault.aiAccessLevel === 'full'
              ? 'Semantic search and vault chat are available.'
              : vault.aiAccessLevel === 'document_chat'
                ? 'Document chat is available.'
                : 'Root status does not grant AI access.'
          }
          icon={<Vault size={20} />}
        />
      </Grid>

      <Grid gap="6" templateColumns={{ base: '1fr', xl: '1.1fr 0.9fr' }}>
        <Stack gap="6">
          <SurfacePanel display="flex" flexDirection="column" gap="5">
            <Box>
              <Text textStyle="label">Rename Vault</Text>
              <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                Vault identity
              </Text>
            </Box>
            <chakra.form
              display="flex"
              flexDirection="column"
              gap="4"
              onSubmit={handleRename}
            >
              <Field>
                <FieldLabel htmlFor="vault-settings-name">Name</FieldLabel>
                <Input
                  id="vault-settings-name"
                  type="text"
                  value={name}
                  disabled={!canManageVault}
                  onChange={(event) =>
                    setDetailsDraft({
                      vaultId,
                      name: event.target.value,
                      description,
                    })
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="vault-settings-description">Description</FieldLabel>
                <Textarea
                  id="vault-settings-description"
                  value={description}
                  disabled={!canManageVault}
                  onChange={(event) =>
                    setDetailsDraft({
                      vaultId,
                      name,
                      description: event.target.value,
                    })
                  }
                  minH="7rem"
                  resize="vertical"
                  placeholder="What belongs in this vault?"
                />
              </Field>
              <SaveButton type="submit" disabled={!canManageVault || renameMutation.isPending}>
                {renameMutation.isPending ? 'Saving...' : 'Save changes'}
              </SaveButton>
            </chakra.form>
          </SurfacePanel>

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
            <chakra.form
              display="flex"
              flexDirection="column"
              gap="4"
              onSubmit={handleInvite}
            >
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
                {inviteMutation.isPending ? 'Adding...' : 'Add member'}
              </Button>
            </chakra.form>
          </SurfacePanel>

          {isRoot && canManageMembers ? (
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
              <chakra.form
                display="flex"
                flexDirection="column"
                gap="4"
                onSubmit={handleEmailInvite}
              >
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
                  {emailInviteMutation.isPending ? 'Creating...' : 'Create email invitation'}
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
                        {updateMemberMutation.isPending ? 'Saving...' : 'Save access'}
                      </SaveButton>
                    </chakra.form>
                  </Box>
                );
              })}
            </Stack>
          </SurfacePanel>
        </Stack>

        <Stack gap="6">
          {isRootAdminOnly ? (
            <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="5">
              <Box>
                <Text textStyle="label">Administrative Access</Text>
                <Text fontSize="xl" fontWeight="bold" color="fg" mt="2">
                  Join this vault
                </Text>
                <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                  You can inspect this vault as root. Join it to become an explicit participant.
                </Text>
              </Box>
              <Button type="button" onClick={() => setIsJoinDialogOpen(true)}>
                Join vault
              </Button>
            </SurfacePanel>
          ) : null}

          {isRootParticipant ? (
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

          <SurfacePanel variant="strong" display="flex" flexDirection="column" gap="5">
            <Box>
              <Text textStyle="label" color="fg.inverted/70">Danger Zone</Text>
              <Text fontSize="xl" fontWeight="bold" mt="2">Delete vault</Text>
            </Box>
            <Text fontSize="sm" lineHeight="6" color="fg.inverted/80">
              Delete this vault permanently from active view. This action remains owner-only.
            </Text>
            <DeleteButton
              type="button"
              w="100%"
              disabled={deleteMutation.isPending || !canManageVault}
              onClick={() => {
                deleteMutation.mutate({ vaultId });
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete vault'}
            </DeleteButton>
          </SurfacePanel>
        </Stack>
      </Grid>

      <ChakraDialog.Root
        open={isJoinDialogOpen}
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
                      idPrefix="root-join-vault"
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
                    <Button
                      type="button"
                      variant="outline"
                      disabled={joinVaultMutation.isPending}
                      onClick={() => setIsJoinDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  <Button type="submit" disabled={joinVaultMutation.isPending}>
                    {joinVaultMutation.isPending ? 'Joining...' : 'Join vault'}
                  </Button>
                </ChakraDialog.Footer>
              </chakra.form>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>
    </Stack>
  );
}

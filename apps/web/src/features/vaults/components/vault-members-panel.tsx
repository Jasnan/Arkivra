import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, Info, Mail, Send, ShieldCheck, Sparkles, UserMinus, UserRoundPlus, Users } from 'lucide-react';
import { toast } from '@/components/ui/toaster-store';
import { SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMeQuery } from '@/features/me/me.queries';
import {
  addVaultMember,
  createVaultEmailInvitation,
  joinVaultAsAdmin,
  leaveVaultAsAdmin,
  removeVaultMember,
  updateVaultMember,
} from '@/features/vaults/vaults.api';
import {
  useVaultMembersQuery,
  useVaultPendingInvitationsQuery,
  vaultQueryKeys,
} from '@/features/vaults/vaults.queries';
import { formatAiAccess, formatVaultRole } from '@/features/vaults/components/vault-member-formatters';
import type { AiAccessLevel, VaultDetail, VaultMember, VaultPendingInvitation, VaultRole } from '@/features/vaults/vaults.types';

const roleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const aiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'No AI access' },
  { value: 'document_chat', label: 'Semantic access' },
  { value: 'full', label: 'Full AI access' },
];

const roleDescriptions: Record<VaultRole, string> = {
  viewer: 'View and download content. Cannot edit or manage members.',
  editor: 'Upload, edit, and organize vault content.',
  owner: 'Manage vault settings, members, and owner access.',
};

const aiAccessDescriptions: Record<AiAccessLevel, string> = {
  none: 'Choose the level of AI features this member can use in this vault.',
  document_chat: 'Allow semantic search and document chat for this vault.',
  full: 'Allow all available AI features for this vault.',
};

type InviteMode = 'direct' | 'email';
type PendingMemberAction = {
  type: 'remove-member' | 'remove-owner-role';
  member: VaultMember;
} | null;

function isRequestResponse<T extends object>(value: T | { request: unknown }): value is { request: unknown } {
  return 'request' in value;
}

function getMemberDisplayName(member: VaultMember) {
  return member.name ?? member.email ?? member.userId;
}

function getMemberInitial(member: VaultMember) {
  return getMemberDisplayName(member).trim().charAt(0).toUpperCase() || '?';
}

function getMemberAvatarTone(index: number) {
  const tones = [
    { bg: 'green.subtle', color: 'green.fg' },
    { bg: 'purple.subtle', color: 'purple.fg' },
    { bg: 'blue.subtle', color: 'blue.fg' },
    { bg: 'orange.subtle', color: 'orange.fg' },
    { bg: 'teal.subtle', color: 'teal.fg' },
  ];

  return tones[index % tones.length]!;
}

function getRoleSelectTone(role: VaultRole) {
  if (role === 'owner') {
    return { bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' };
  }
  if (role === 'editor') {
    return { bg: 'blue.subtle', color: 'blue.fg', borderColor: 'blue.muted' };
  }

  return { bg: 'bg.subtle', color: 'fg.muted', borderColor: 'border.surface' };
}

function getAiAccessSelectTone(aiAccessLevel: AiAccessLevel) {
  if (aiAccessLevel === 'full') {
    return { bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' };
  }
  if (aiAccessLevel === 'document_chat') {
    return { bg: 'purple.subtle', color: 'purple.fg', borderColor: 'purple.muted' };
  }

  return { bg: 'orange.subtle', color: 'orange.fg', borderColor: 'orange.muted' };
}

function getPendingInvitationStatus(invitation: VaultPendingInvitation) {
  if (invitation.status === 'approval_pending') {
    return { label: 'Awaiting admin approval', colorPalette: 'orange' };
  }

  return { label: 'Pending acceptance', colorPalette: 'blue' };
}

function formatPendingInviteDate(value: string | null) {
  if (value === null) {
    return 'No expiry';
  }

  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

function RoleSelect({
  value,
  disabled,
  disabledRoles = [],
  onValueChange,
}: {
  value: VaultRole;
  disabled?: boolean;
  disabledRoles?: VaultRole[];
  onValueChange: (role: VaultRole) => void;
}) {
  const tone = getRoleSelectTone(value);

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as VaultRole)} disabled={disabled}>
      <SelectTrigger
        aria-label="Vault role"
        minW="10rem"
        h="2.5rem"
        rounded="md"
        bg={tone.bg}
        color={tone.color}
        borderColor={tone.borderColor}
        px="3"
        _hover={{ bg: tone.bg, borderColor: tone.borderColor }}
      >
        <HStack gap="2">
          {value === 'owner' ? <Crown size={15} /> : null}
          <SelectValue />
        </HStack>
      </SelectTrigger>
      <SelectContent>
        {!disabledRoles.includes('viewer') ? (
          <SelectItem value="viewer">
            Viewer
          </SelectItem>
        ) : null}
        {!disabledRoles.includes('editor') ? (
          <SelectItem value="editor">
            Editor
          </SelectItem>
        ) : null}
        {!disabledRoles.includes('viewer') || !disabledRoles.includes('editor') ? (
          <Box mx="-1" my="1" h="1px" bg="border.divider" />
        ) : null}
        <SelectItem value="owner">
          Owner
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function AiAccessSelect({
  value,
  disabled,
  onValueChange,
}: {
  value: AiAccessLevel;
  disabled?: boolean;
  onValueChange: (level: AiAccessLevel) => void;
}) {
  const tone = getAiAccessSelectTone(value);

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as AiAccessLevel)} disabled={disabled}>
      <SelectTrigger
        aria-label="AI access"
        minW="12rem"
        h="2.5rem"
        rounded="md"
        bg={tone.bg}
        color={tone.color}
        borderColor={tone.borderColor}
        px="3"
        _hover={{ bg: tone.bg, borderColor: tone.borderColor }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {aiAccessOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InviteSelect({
  id,
  label,
  value,
  disabled,
  icon,
  description,
  options,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  icon: ReactNode;
  description: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} h="3rem" rounded="md" px="4">
          <HStack gap="3">
            {icon}
            <SelectValue />
          </HStack>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{description}</FieldDescription>
    </Field>
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
  const meQuery = useMeQuery();
  const membersQuery = useVaultMembersQuery({ vaultId });
  const pendingInvitationsQuery = useVaultPendingInvitationsQuery({ vaultId });
  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data?.members]);
  const pendingInvitations = useMemo(
    () => pendingInvitationsQuery.data?.invitations ?? [],
    [pendingInvitationsQuery.data?.invitations],
  );
  const ownerCount = useMemo(() => members.filter((member) => member.role === 'owner').length, [members]);

  const [inviteMode, setInviteMode] = useState<InviteMode>('direct');
  const [inviteTarget, setInviteTarget] = useState('');
  const [inviteRole, setInviteRole] = useState<VaultRole>('viewer');
  const [inviteAiAccessLevel, setInviteAiAccessLevel] = useState<AiAccessLevel>('none');
  const [memberDrafts, setMemberDrafts] = useState<Record<string, { role: VaultRole; aiAccessLevel: AiAccessLevel }>>({});
  const [pendingMemberAction, setPendingMemberAction] = useState<PendingMemberAction>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [joinRole, setJoinRole] = useState<VaultRole>('owner');
  const [joinAiAccessLevel, setJoinAiAccessLevel] = useState<AiAccessLevel>('full');

  const canManageMembers = vault.role === 'owner';
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
      setInviteTarget('');
      setInviteRole('viewer');
      setInviteAiAccessLevel('none');
      setIsInviteDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.invitations(vaultId) });
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

  const emailInviteMutation = useMutation({
    mutationFn: createVaultEmailInvitation,
    onSuccess: async (result) => {
      toast.success(
        isRequestResponse(result)
          ? 'Email invitation request queued for admin approval.'
          : `Invitation created for ${result.invitation.email}.`,
      );
      setInviteTarget('');
      setInviteRole('viewer');
      setInviteAiAccessLevel('none');
      setIsInviteDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.invitations(vaultId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create invitation.');
    },
  });

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const target = inviteTarget.trim();
    if (!target) {
      toast.warning('Email or user ID is required.');
      return;
    }

    if (target.includes('@')) {
      emailInviteMutation.mutate({
        vaultId,
        email: target,
        role: inviteRole,
        aiAccessLevel: inviteAiAccessLevel,
      });
      return;
    }

    inviteMutation.mutate({
      vaultId,
      userId: target,
      role: inviteRole,
      aiAccessLevel: inviteAiAccessLevel,
    });
  }

  function handleEmailInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = inviteTarget.trim();
    if (!email) {
      toast.warning('Email is required.');
      return;
    }

    emailInviteMutation.mutate({
      vaultId,
      email,
      role: inviteRole,
      aiAccessLevel: inviteAiAccessLevel,
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

  function updateMemberAccess(member: VaultMember, draft: Partial<{ role: VaultRole; aiAccessLevel: AiAccessLevel }>) {
    const currentDraft = getMemberDraft(member);
    const nextDraft = {
      ...currentDraft,
      ...draft,
    };

    if (member.role === 'owner' && nextDraft.role !== 'owner' && ownerCount <= 1) {
      toast.warning('At least one owner is required.');
      return;
    }

    updateMemberDraft(member, draft);
    updateMemberMutation.mutate({
      vaultId,
      memberUserId: member.userId,
      role: nextDraft.role,
      aiAccessLevel: nextDraft.aiAccessLevel,
    });
  }

  function confirmPendingMemberAction() {
    if (pendingMemberAction === null) {
      return;
    }

    const { member, type } = pendingMemberAction;
    if (member.role === 'owner' && ownerCount <= 1) {
      toast.warning('At least one owner is required.');
      setPendingMemberAction(null);
      return;
    }

    if (type === 'remove-owner-role') {
      const draft = getMemberDraft(member);
      updateMemberMutation.mutate(
        {
          vaultId,
          memberUserId: member.userId,
          role: 'viewer',
          aiAccessLevel: draft.aiAccessLevel,
        },
        {
          onSuccess: () => setPendingMemberAction(null),
        },
      );
      return;
    }

    removeMemberMutation.mutate(
      { vaultId, memberUserId: member.userId },
      {
        onSuccess: () => setPendingMemberAction(null),
      },
    );
  }

  const isInviteDialogDirty = inviteTarget.trim().length > 0;
  const canDismissInviteDialog = !isInviteDialogDirty && !inviteMutation.isPending && !emailInviteMutation.isPending;
  const inviteMutationPending = inviteMutation.isPending || emailInviteMutation.isPending;
  const currentUserId = meQuery.data?.userId;
  const memberActionPending = removeMemberMutation.isPending || updateMemberMutation.isPending;
  const pendingMemberName = pendingMemberAction === null ? 'this member' : getMemberDisplayName(pendingMemberAction.member);

  return (
    <>
      <Stack gap="8" maxW="6xl" w="full">
        <Flex
          align={{ base: 'stretch', md: 'flex-end' }}
          justify="space-between"
          direction={{ base: 'column', md: 'row' }}
          gap="4"
        >
          <Stack gap="2">
            <Text as="h2" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" lineHeight="short" color="fg">
              Members
            </Text>
            <Text fontSize="md" color="fg.muted">
              Manage who has access to this vault and their permissions.
            </Text>
          </Stack>
          <Button
            type="button"
            size="md"
            disabled={!canManageMembers}
            onClick={() => setIsInviteDialogOpen(true)}
          >
            <UserRoundPlus size={17} />
            Invite Member
          </Button>
        </Flex>

        <Box
          overflow="hidden"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          shadow="sm"
        >
          <Grid
            templateColumns={{ base: '1fr', lg: 'minmax(16rem, 2.2fr) minmax(10rem, 1.15fr) minmax(12rem, 1.25fr) 4rem' }}
            gap="4"
            borderBottomWidth="1px"
            borderColor="border.surface"
            bg="bg.subtle"
            px={{ base: '4', md: '6' }}
            py="4"
            display={{ base: 'none', lg: 'grid' }}
          >
            {['Member', 'Role', 'AI access', 'Actions'].map((heading) => (
              <Text key={heading} fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                {heading}
              </Text>
            ))}
          </Grid>

          {membersQuery.isLoading ? (
            <Box px="6" py="8">
              <Text fontSize="sm" color="fg.muted">Loading members...</Text>
            </Box>
          ) : null}
          {membersQuery.isError ? (
            <Box px="6" py="8">
              <Text fontSize="sm" color="fg.error">Unable to load members.</Text>
            </Box>
          ) : null}

          {!membersQuery.isLoading && !membersQuery.isError ? (
            <Stack gap="0">
              {members.map((member, index) => {
                const draft = getMemberDraft(member);
                const avatarTone = getMemberAvatarTone(index);
                const isCurrentUser = currentUserId === member.userId;
                const canRemoveOrDemoteOwner = member.role !== 'owner' || ownerCount > 1;
                const shouldShowActionMenu = canManageMembers && currentUserId !== undefined && !isCurrentUser && canRemoveOrDemoteOwner;
                const disabledRoleOptions: VaultRole[] = member.role === 'owner' && ownerCount <= 1
                  ? ['viewer', 'editor']
                  : [];

                return (
                  <Grid
                    key={member.userId}
                    templateColumns={{ base: '1fr', lg: 'minmax(16rem, 2.2fr) minmax(10rem, 1.15fr) minmax(12rem, 1.25fr) 4rem' }}
                    gap={{ base: '3', lg: '4' }}
                    alignItems="center"
                    borderBottomWidth={index === members.length - 1 ? '0' : '1px'}
                    borderColor="border.surface"
                    px={{ base: '4', md: '6' }}
                    py="4"
                  >
                    <HStack gap="4" minW="0">
                      <Flex
                        boxSize="12"
                        shrink="0"
                        align="center"
                        justify="center"
                        rounded="full"
                        bg={avatarTone.bg}
                        color={avatarTone.color}
                        fontWeight="bold"
                      >
                        {getMemberInitial(member)}
                      </Flex>
                      <Box minW="0">
                        <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
                          {getMemberDisplayName(member)}
                        </Text>
                        <Text mt="1" fontSize="sm" color="fg.muted" truncate>
                          {member.email ?? member.userId}
                        </Text>
                      </Box>
                    </HStack>

                    <Box>
                      <Text display={{ base: 'block', lg: 'none' }} mb="1" fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                        Role
                      </Text>
                      <RoleSelect
                        value={draft.role}
                        disabledRoles={disabledRoleOptions}
                        disabled={!canManageMembers || updateMemberMutation.isPending}
                        onValueChange={(role) => updateMemberAccess(member, { role })}
                      />
                    </Box>

                    <Box>
                      <Text display={{ base: 'block', lg: 'none' }} mb="1" fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                        AI access
                      </Text>
                      <AiAccessSelect
                        value={draft.aiAccessLevel}
                        disabled={!canManageMembers || updateMemberMutation.isPending}
                        onValueChange={(aiAccessLevel) => updateMemberAccess(member, { aiAccessLevel })}
                      />
                    </Box>

                    <Flex justify={{ base: 'flex-start', lg: 'center' }}>
                      {shouldShowActionMenu ? (
                        <DropdownMenu positioning={{ placement: 'bottom-end' }}>
                          <DropdownMenuTrigger asChild>
                            <ActionMenuTriggerButton label={`Actions for ${getMemberDisplayName(member)}`} borderWidth="0" bg="transparent" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent minW="13rem">
                            {member.role === 'owner' ? (
                              <DropdownMenuItem
                                value="remove-owner-role"
                                disabled={updateMemberMutation.isPending}
                                color="fg.error"
                                onSelect={() => setPendingMemberAction({ type: 'remove-owner-role', member })}
                              >
                                <ActionMenuItemIcon icon={Crown} tone="destructive" />
                                Remove owner role
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              value="remove-from-vault"
                              disabled={!canManageMembers || removeMemberMutation.isPending}
                              color="fg.error"
                              onSelect={() => setPendingMemberAction({ type: 'remove-member', member })}
                            >
                              <ActionMenuItemIcon icon={UserMinus} tone="destructive" />
                              Remove from vault
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Text fontSize="sm" color="fg.subtle">-</Text>
                      )}
                    </Flex>
                  </Grid>
                );
              })}
            </Stack>
          ) : null}

          <HStack gap="3" borderTopWidth="1px" borderColor="border.surface" px={{ base: '4', md: '6' }} py="4" color="fg.muted">
            <Info size={16} />
            <Text fontSize="sm">
              Owners can manage vault settings and members. At least one owner is required.
            </Text>
          </HStack>
        </Box>

        <Box
          overflow="hidden"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          shadow="sm"
        >
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            justify="space-between"
            gap="3"
            borderBottomWidth="1px"
            borderColor="border.surface"
            px={{ base: '4', md: '6' }}
            py="4"
          >
            <Box>
              <Text fontSize="md" fontWeight="semibold" color="fg">Pending invites</Text>
              <Text mt="1" fontSize="sm" color="fg.muted">
                Invitations waiting for admin approval or recipient acceptance.
              </Text>
            </Box>
            <Badge variant="secondary" colorPalette="gray" alignSelf={{ base: 'flex-start', md: 'center' }}>
              {pendingInvitations.length}
            </Badge>
          </Flex>

          <Grid
            templateColumns={{ base: '1fr', lg: 'minmax(14rem, 2fr) minmax(9rem, 1fr) minmax(11rem, 1.1fr) minmax(12rem, 1.2fr) minmax(8rem, 0.8fr)' }}
            gap="4"
            borderBottomWidth="1px"
            borderColor="border.surface"
            bg="bg.subtle"
            px={{ base: '4', md: '6' }}
            py="3"
            display={{ base: 'none', lg: 'grid' }}
          >
            {['Email', 'Role', 'AI access', 'Status', 'Expires'].map((heading) => (
              <Text key={heading} fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                {heading}
              </Text>
            ))}
          </Grid>

          {pendingInvitationsQuery.isLoading ? (
            <Box px="6" py="6">
              <Text fontSize="sm" color="fg.muted">Loading pending invites...</Text>
            </Box>
          ) : null}
          {pendingInvitationsQuery.isError ? (
            <Box px="6" py="6">
              <Text fontSize="sm" color="fg.error">Unable to load pending invites.</Text>
            </Box>
          ) : null}
          {!pendingInvitationsQuery.isLoading && !pendingInvitationsQuery.isError && pendingInvitations.length === 0 ? (
            <Box px="6" py="6">
              <Text fontSize="sm" color="fg.muted">No pending invites.</Text>
            </Box>
          ) : null}
          {!pendingInvitationsQuery.isLoading && !pendingInvitationsQuery.isError && pendingInvitations.length > 0 ? (
            <Stack gap="0">
              {pendingInvitations.map((invitation, index) => {
                const status = getPendingInvitationStatus(invitation);

                return (
                  <Grid
                    key={`${invitation.source}-${invitation.id}`}
                    templateColumns={{ base: '1fr', lg: 'minmax(14rem, 2fr) minmax(9rem, 1fr) minmax(11rem, 1.1fr) minmax(12rem, 1.2fr) minmax(8rem, 0.8fr)' }}
                    gap={{ base: '3', lg: '4' }}
                    alignItems="center"
                    borderBottomWidth={index === pendingInvitations.length - 1 ? '0' : '1px'}
                    borderColor="border.surface"
                    px={{ base: '4', md: '6' }}
                    py="4"
                  >
                    <Box minW="0">
                      <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
                        {invitation.email}
                      </Text>
                      <Text mt="1" fontSize="xs" color="fg.muted" truncate>
                        Requested {formatPendingInviteDate(invitation.createdAt)}
                      </Text>
                    </Box>
                    <Box>
                      <Text display={{ base: 'block', lg: 'none' }} mb="1" fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                        Role
                      </Text>
                      <Text fontSize="sm" fontWeight="medium" color="fg">{formatVaultRole(invitation.role)}</Text>
                    </Box>
                    <Box>
                      <Text display={{ base: 'block', lg: 'none' }} mb="1" fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                        AI access
                      </Text>
                      <Text fontSize="sm" fontWeight="medium" color="fg">{formatAiAccess(invitation.aiAccessLevel)}</Text>
                    </Box>
                    <Box>
                      <Text display={{ base: 'block', lg: 'none' }} mb="1" fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                        Status
                      </Text>
                      <Badge variant="secondary" colorPalette={status.colorPalette}>
                        {status.label}
                      </Badge>
                    </Box>
                    <Box>
                      <Text display={{ base: 'block', lg: 'none' }} mb="1" fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                        Expires
                      </Text>
                      <Text fontSize="sm" color="fg.muted">{formatPendingInviteDate(invitation.expiresAt)}</Text>
                    </Box>
                  </Grid>
                );
              })}
            </Stack>
          ) : null}
        </Box>

        <SurfacePanel p={{ base: '5', md: '6' }}>
          <Stack gap="5">
            <Text fontSize="md" fontWeight="semibold" color="fg">Your access</Text>
            <Flex
              direction={{ base: 'column', lg: 'row' }}
              align={{ base: 'stretch', lg: 'center' }}
              justify="space-between"
              gap="5"
            >
              <HStack gap="5" align="center">
                <Flex
                  boxSize="14"
                  shrink="0"
                  align="center"
                  justify="center"
                  rounded="full"
                  borderWidth="1px"
                  borderColor="green.muted"
                  bg="green.subtle"
                  color="green.fg"
                >
                  <ShieldCheck size={24} />
                </Flex>
                <Grid gap="5" templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(8rem, 1fr))' }}>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color="fg.muted">Role</Text>
                    <Text mt="1" fontSize="md" fontWeight="semibold" color="fg">{formatVaultRole(vault.role, vault.isAdmin)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color="fg.muted">AI access</Text>
                    <Text mt="1" fontSize="md" fontWeight="semibold" color="fg">{formatAiAccess(vault.aiAccessLevel)}</Text>
                  </Box>
                </Grid>
              </HStack>

              <Stack gap="1" maxW={{ lg: '24rem' }}>
                <Text fontSize="sm" fontWeight="semibold" color="fg">
                  {vault.role === 'owner'
                    ? 'You are an owner of this vault.'
                    : isAdminOnly
                      ? 'You have administrative read-only access.'
                      : 'You are a member of this vault.'}
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  {vault.role === 'owner'
                    ? 'You can manage vault settings and members.'
                    : isAdminOnly
                      ? 'Join to become an explicit participant.'
                      : 'Your permissions are managed by a vault owner.'}
                </Text>
              </Stack>

              {isAdminOnly ? (
                <Button type="button" onClick={() => setIsJoinDialogOpen(true)}>
                  Join vault
                </Button>
              ) : null}
              {isAdminParticipant ? (
                <Stack gap="2" align={{ base: 'stretch', lg: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={leaveVaultMutation.isPending}
                    onClick={() => leaveVaultMutation.mutate({ vaultId })}
                  >
                    {leaveVaultMutation.isPending ? 'Removing...' : 'Remove explicit membership'}
                  </Button>
                  <Text fontSize="xs" color="fg.muted">You will retain admin read-only access.</Text>
                </Stack>
              ) : null}
            </Flex>
          </Stack>
        </SurfacePanel>
      </Stack>

      <ChakraDialog.Root
        open={pendingMemberAction !== null}
        closeOnEscape={!memberActionPending}
        closeOnInteractOutside={!memberActionPending}
        onOpenChange={(event) => {
          if (!event.open && !memberActionPending) {
            setPendingMemberAction(null);
          }
        }}
        size={{ mdDown: 'full', md: 'md' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>
                  {pendingMemberAction?.type === 'remove-owner-role'
                    ? 'Remove owner role?'
                    : 'Remove member from vault?'}
                </ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Text fontSize="sm" lineHeight="6" color="fg.muted">
                  {pendingMemberAction?.type === 'remove-owner-role'
                    ? `${pendingMemberName} will become a viewer and will no longer manage vault settings or members.`
                    : `${pendingMemberName} will lose access to this vault.`}
                </Text>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <Button type="button" variant="outline" disabled={memberActionPending} onClick={() => setPendingMemberAction(null)}>
                  Cancel
                </Button>
                <Button type="button" colorPalette="red" disabled={memberActionPending} onClick={confirmPendingMemberAction}>
                  {memberActionPending
                    ? 'Removing...'
                    : pendingMemberAction?.type === 'remove-owner-role'
                      ? 'Remove owner role'
                      : 'Remove from vault'}
                </Button>
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <ChakraDialog.Root
        open={isInviteDialogOpen}
        closeOnEscape={canDismissInviteDialog}
        closeOnInteractOutside={canDismissInviteDialog}
        onOpenChange={(event) => {
          if (!event.open && !inviteMutation.isPending && !emailInviteMutation.isPending) {
            setIsInviteDialogOpen(false);
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
                  if (inviteMode === 'email') {
                    handleEmailInvite(event);
                    return;
                  }

                  handleInvite(event);
                }}
              >
                <ChakraDialog.Header px="7" pt="7" pb="3">
                  <Stack gap="3" flex="1">
                    <Flex align="center" justify="space-between" gap="4">
                      <ChakraDialog.Title>Invite Member</ChakraDialog.Title>
                      <ChakraDialog.CloseTrigger asChild>
                        <CloseButton size="sm" />
                      </ChakraDialog.CloseTrigger>
                    </Flex>
                    <Text fontSize="sm" color="fg.muted">
                      Invite a new member to this vault.
                    </Text>
                  </Stack>
                </ChakraDialog.Header>
                <ChakraDialog.Body px="7" py="4">
                  <Stack gap="5">
                    <Field>
                      <FieldLabel>Invite by</FieldLabel>
                      <Grid
                        templateColumns="repeat(2, minmax(0, 1fr))"
                        overflow="hidden"
                        rounded="md"
                        borderWidth="1px"
                        borderColor="border.surface"
                        bg="bg.surface"
                      >
                        <chakra.button
                          type="button"
                          minH="3.25rem"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          gap="2"
                          borderBottomWidth="2px"
                          borderColor={inviteMode === 'direct' ? 'teal.solid' : 'transparent'}
                          bg={inviteMode === 'direct' ? 'teal.subtle' : 'bg.surface'}
                          color={inviteMode === 'direct' ? 'teal.fg' : 'fg.muted'}
                          fontSize="sm"
                          fontWeight="semibold"
                          onClick={() => setInviteMode('direct')}
                        >
                          <Mail size={16} />
                          Email or User ID
                        </chakra.button>
                        <chakra.button
                          type="button"
                          minH="3.25rem"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          gap="2"
                          borderBottomWidth="2px"
                          borderLeftWidth="1px"
                          borderColor={inviteMode === 'email' ? 'teal.solid' : 'border.surface'}
                          bg={inviteMode === 'email' ? 'teal.subtle' : 'bg.surface'}
                          color={inviteMode === 'email' ? 'teal.fg' : 'fg.muted'}
                          fontSize="sm"
                          fontWeight="semibold"
                          onClick={() => setInviteMode('email')}
                        >
                          <Mail size={16} />
                          Email Invitation
                        </chakra.button>
                      </Grid>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="vault-invite-target">
                        {inviteMode === 'email' ? 'Email' : 'Email or User ID'}
                      </FieldLabel>
                      <Box position="relative">
                        <Input
                          id="vault-invite-target"
                          type={inviteMode === 'email' ? 'email' : 'text'}
                          value={inviteTarget}
                          onChange={(event) => setInviteTarget(event.target.value)}
                          placeholder={inviteMode === 'email' ? 'Enter email address' : 'Enter email address or user ID'}
                          disabled={!canManageMembers || inviteMutationPending}
                          pr="11"
                        />
                        <Flex
                          position="absolute"
                          top="0"
                          right="3"
                          h="full"
                          align="center"
                          justify="center"
                          color="fg.muted"
                          pointerEvents="none"
                        >
                          <UserRoundPlus size={17} />
                        </Flex>
                      </Box>
                      <FieldDescription>
                        {inviteMode === 'email'
                          ? 'Admins create invitations immediately. Owner invitations are queued for admin approval.'
                          : 'If the user has an Arkivra account, they will be added immediately. Otherwise, an email invitation will be sent.'}
                      </FieldDescription>
                    </Field>

                    <InviteSelect
                      id="vault-invite-role"
                      label="Role"
                      value={inviteRole}
                      disabled={!canManageMembers || inviteMutationPending}
                      icon={<Users size={17} />}
                      description={roleDescriptions[inviteRole]}
                      options={roleOptions}
                      onValueChange={(value) => setInviteRole(value as VaultRole)}
                    />

                    <InviteSelect
                      id="vault-invite-ai-access"
                      label="AI access"
                      value={inviteAiAccessLevel}
                      disabled={!canManageMembers || inviteMutationPending}
                      icon={<Sparkles size={17} />}
                      description={aiAccessDescriptions[inviteAiAccessLevel]}
                      options={aiAccessOptions}
                      onValueChange={(value) => setInviteAiAccessLevel(value as AiAccessLevel)}
                    />
                  </Stack>
                </ChakraDialog.Body>
                <ChakraDialog.Footer px="7" pb="7" pt="3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={inviteMutationPending}
                    onClick={() => setIsInviteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!canManageMembers || inviteMutationPending}>
                    <Send size={16} />
                    {inviteMutationPending ? 'Sending...' : 'Send Invite'}
                  </Button>
                </ChakraDialog.Footer>
              </chakra.form>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

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

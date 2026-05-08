import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, ShieldCheck, Users, Vault } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  deleteVault,
  removeVaultMember,
  renameVault,
  transferVaultOwnership,
  updateVaultMember,
} from '@/features/vaults/vaults.api';
import { PermissionCheckboxGrid } from '@/features/vaults/components/permission-checkbox-grid';
import {
  useVaultMembersQuery,
  useVaultQuery,
  vaultQueryKeys,
} from '@/features/vaults/vaults.queries';
import { VAULT_MEMBER_PERMISSIONS } from '@/features/vaults/vaults.types';
import type { VaultMemberPermission } from '@/features/vaults/vaults.types';

const defaultInvitePermissions: VaultMemberPermission[] = [
  'documents.read',
  'documents.create',
  'documents.update',
  'documents.delete',
  'documents.download',
  'tags.manage',
];

function collectPermissions(form: HTMLFormElement) {
  const data = new FormData(form);
  const permissions = data
    .getAll('permissions')
    .filter(
      (value): value is VaultMemberPermission =>
        typeof value === 'string' &&
        VAULT_MEMBER_PERMISSIONS.includes(value as VaultMemberPermission),
    );

  return permissions;
}

export function VaultSettingsPage() {
  const params = useParams<{ vaultId: string }>();
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
  const [invitePermissions, setInvitePermissions] =
    useState<VaultMemberPermission[]>(defaultInvitePermissions);
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const draftMatchesVault = detailsDraft?.vaultId === vaultId;
  const name = draftMatchesVault ? detailsDraft.name : vaultQuery.data?.vault.name ?? '';
  const description = draftMatchesVault
    ? detailsDraft.description
    : vaultQuery.data?.vault.description ?? '';

  const ownerCandidates = useMemo(
    () => members.filter((member) => member.role === 'member'),
    [members],
  );

  const canManageMembers =
    vaultQuery.data?.vault.role === 'owner' ||
    vaultQuery.data?.vault.isGlobalAdmin ||
    (vaultQuery.data?.vault.permissions ?? []).includes('members.manage');

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      navigate(ROUTES.vaults);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete vault.');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: addVaultMember,
    onSuccess: async () => {
      toast.success('Member added to vault.');
      setInviteUserId('');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not add member.');
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: updateVaultMember,
    onSuccess: async () => {
      toast.success('Member permissions updated.');
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

  const transferMutation = useMutation({
    mutationFn: transferVaultOwnership,
    onSuccess: async () => {
      toast.success('Ownership transferred.');
      setTransferTargetUserId('');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not transfer ownership.');
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
      role: 'member',
      permissions: invitePermissions,
    });
  }

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Vault Governance"
        title="Vault settings"
        description={`${vault.name} • ${vault.id}`}
        actions={
            <Link to={ROUTES.vaultDocuments(vaultId)} style={{ color: 'var(--chakra-colors-teal-solid)', fontWeight: 600, fontSize: '0.875rem' }}>
              Open documents
            </Link>
        }
      />
      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}>
        <StatCard
          label="Your role"
          value={vault.role ?? 'global_admin'}
          meta="Current privilege level inside this vault."
          icon={<ShieldCheck size={20} />}
        />
        <StatCard
          label="Members"
          value={members.length}
          meta="People currently attached to this vault."
          icon={<Users size={20} />}
        />
        <StatCard
          label="Vault control"
          value={canManageMembers ? 'Managed' : 'Limited'}
          meta={
            canManageMembers
              ? 'You can invite and update members here.'
              : 'Your current permissions do not allow member management.'
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
              <SaveButton type="submit" disabled={renameMutation.isPending}>
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
                Invite by user id and assign initial permissions.
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

              <PermissionCheckboxGrid
                idPrefix="vault-invite-permission"
                selectedPermissions={invitePermissions}
                onSelectedPermissionsChange={setInvitePermissions}
                disabled={!canManageMembers}
                cardBg="bg.subtle"
              />

              <Button type="submit" disabled={!canManageMembers || inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Inviting...' : 'Invite member'}
              </Button>
            </chakra.form>
          </SurfacePanel>

          <SurfacePanel display="flex" flexDirection="column" gap="5">
            <Box>
              <Text textStyle="label">Members & Permissions</Text>
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
              {members.map((member) => (
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
                        {member.userId} • {member.role}
                      </Text>
                    </Box>
                    {member.role === 'member' ? (
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

                  {member.role === 'member' ? (
                    <chakra.form
                      display="flex"
                      flexDirection="column"
                      gap="4"
                      onSubmit={(event: FormEvent<HTMLFormElement>) => {
                        event.preventDefault();
                        const permissions = collectPermissions(event.currentTarget);
                        updateMemberMutation.mutate({
                          vaultId,
                          memberUserId: member.userId,
                          role: 'member',
                          permissions,
                        });
                      }}
                    >
                      <PermissionCheckboxGrid
                        idPrefix={member.userId}
                        inputName="permissions"
                        defaultSelectedPermissions={member.permissions}
                        disabled={!canManageMembers}
                        cardBg="bg.panel"
                      />

                      <SaveButton
                        type="submit"
                        disabled={!canManageMembers || updateMemberMutation.isPending}
                      >
                        {updateMemberMutation.isPending ? 'Saving...' : 'Save changes'}
                      </SaveButton>
                    </chakra.form>
                  ) : (
                    <Text fontSize="sm" color="fg.muted">Owner has full permissions.</Text>
                  )}
                </Box>
              ))}
            </Stack>
          </SurfacePanel>
        </Stack>

        <Stack gap="6">
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
                  vault.role !== 'owner'
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
              disabled={deleteMutation.isPending || vault.role !== 'owner'}
              onClick={() => {
                deleteMutation.mutate({ vaultId });
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete vault'}
            </DeleteButton>
          </SurfacePanel>
        </Stack>
      </Grid>
    </Stack>
  );
}

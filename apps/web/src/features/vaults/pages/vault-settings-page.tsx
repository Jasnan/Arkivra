import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, ShieldCheck, Users, Vault } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PageIntro,
  StatCard,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
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

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');
  const [invitePermissions, setInvitePermissions] =
    useState<VaultMemberPermission[]>(defaultInvitePermissions);
  const [transferTargetUserId, setTransferTargetUserId] = useState('');

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
      navigate('/vaults');
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

  useEffect(() => {
    const vault = vaultQuery.data?.vault;

    if (!vault) {
      return;
    }

    setName(vault.name);
    setDescription(vault.description ?? '');
  }, [vaultQuery.data?.vault]);

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  if (vaultQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading vault settings...</p>;
  }

  if (vaultQuery.isError || !vaultQuery.data) {
    return <p className="text-sm text-destructive">Unable to load vault settings.</p>;
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
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Vault Governance"
        title="Vault settings"
        description={`${vault.name} • ${vault.id}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/vaults/${vaultId}/documents`} className="vault-link">
              Open documents
            </Link>
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Your role"
          value={vault.role ?? 'global_admin'}
          meta="Current privilege level inside this vault."
          icon={<ShieldCheck className="size-5" />}
        />
        <StatCard
          label="Members"
          value={members.length}
          meta="People currently attached to this vault."
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="Vault control"
          value={canManageMembers ? 'Managed' : 'Limited'}
          meta={
            canManageMembers
              ? 'You can invite and update members here.'
              : 'Your current permissions do not allow member management.'
          }
          icon={<Vault className="size-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Rename Vault</p>
              <h2 className="font-display mt-2 text-xl font-bold  text-foreground">
                Vault identity
              </h2>
            </div>
            <form className="space-y-4" onSubmit={handleRename}>
              <Field>
                <FieldLabel htmlFor="vault-settings-name">Name</FieldLabel>
                <Input
                  id="vault-settings-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="vault-settings-description">Description</FieldLabel>
                <Textarea
                  id="vault-settings-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-28 resize-y"
                  placeholder="What belongs in this vault?"
                />
              </Field>
              <Button type="submit" disabled={renameMutation.isPending}>
                {renameMutation.isPending ? 'Saving...' : 'Save details'}
              </Button>
            </form>
          </SurfacePanel>

          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Invite Member</p>
              <h2 className="font-display mt-2 text-xl font-bold  text-foreground">
                Access onboarding
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Invite by user id and assign initial permissions.
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleInvite}>
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
                cardClassName="bg-secondary/55"
              />

              <Button type="submit" disabled={!canManageMembers || inviteMutation.isPending}>
                {inviteMutation.isPending ? 'Inviting...' : 'Invite member'}
              </Button>
            </form>
          </SurfacePanel>

          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Members & Permissions</p>
              <h2 className="font-display mt-2 text-xl font-bold  text-foreground">
                Access roster
              </h2>
            </div>

            {membersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading members...</p>
            ) : null}
            {membersQuery.isError ? (
              <p className="text-sm text-destructive">Unable to load members.</p>
            ) : null}

            <div className="space-y-4">
              {members.map((member) => (
                <article key={member.userId} className="rounded-lg bg-secondary/56 p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {member.name ?? member.email}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {member.userId} • {member.role}
                      </p>
                    </div>
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
                  </div>

                  {member.role === 'member' ? (
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
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
                        cardClassName="bg-card/80"
                      />

                      <Button
                        type="submit"
                        disabled={!canManageMembers || updateMemberMutation.isPending}
                      >
                        {updateMemberMutation.isPending ? 'Saving...' : 'Save permissions'}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground">Owner has full permissions.</p>
                  )}
                </article>
              ))}
            </div>
          </SurfacePanel>
        </div>

        <div className="space-y-6">
          <SurfacePanel variant="soft" className="space-y-5">
            <div>
              <p className="vault-label">Transfer Ownership</p>
              <h2 className="font-display mt-2 text-xl font-bold  text-foreground">
                Promote a member
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Promote an existing member to owner when responsibility needs to change hands.
              </p>
            </div>
            <div className="space-y-4">
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
                <ArrowRightLeft className="size-4" />
                {transferMutation.isPending ? 'Transferring...' : 'Transfer ownership'}
              </Button>
            </div>
          </SurfacePanel>

          <SurfacePanel variant="strong" className="space-y-5">
            <div>
              <p className="vault-label text-primary-foreground/70">Danger Zone</p>
              <h2 className="font-display mt-2 text-xl font-bold ">Delete vault</h2>
            </div>
            <p className="text-sm leading-6 text-primary-foreground/80">
              Delete this vault permanently from active view. This action remains owner-only.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={deleteMutation.isPending || vault.role !== 'owner'}
              onClick={() => {
                deleteMutation.mutate({ vaultId });
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete vault'}
            </Button>
          </SurfacePanel>
        </div>
      </div>
    </section>
  );
}

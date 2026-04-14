import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  addVaultMember,
  deleteVault,
  removeVaultMember,
  renameVault,
  transferVaultOwnership,
  updateVaultMember,
} from '@/features/vaults/vaults.api';
import { useVaultMembersQuery, useVaultQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';
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
    .filter((value): value is VaultMemberPermission => typeof value === 'string' && VAULT_MEMBER_PERMISSIONS.includes(value as VaultMemberPermission));

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
  const [inviteUserId, setInviteUserId] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<VaultMemberPermission[]>(defaultInvitePermissions);
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ownerCandidates = useMemo(
    () => members.filter(member => member.role === 'member'),
    [members],
  );

  const canManageMembers = (vaultQuery.data?.vault.role === 'owner')
    || vaultQuery.data?.vault.isGlobalAdmin
    || (vaultQuery.data?.vault.permissions ?? []).includes('members.manage');

  const renameMutation = useMutation({
    mutationFn: renameVault,
    onSuccess: async () => {
      setStatusMessage('Vault name updated.');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update vault name.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVault,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      navigate('/vaults');
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete vault.');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: addVaultMember,
    onSuccess: async () => {
      setStatusMessage('Member added to vault.');
      setInviteUserId('');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not add member.');
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: updateVaultMember,
    onSuccess: async () => {
      setStatusMessage('Member permissions updated.');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update member.');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: removeVaultMember,
    onSuccess: async () => {
      setStatusMessage('Member removed from vault.');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove member.');
    },
  });

  const transferMutation = useMutation({
    mutationFn: transferVaultOwnership,
    onSuccess: async () => {
      setStatusMessage('Ownership transferred.');
      setTransferTargetUserId('');
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) });
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not transfer ownership.');
    },
  });

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  if (vaultQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading vault settings…</p>;
  }

  if (vaultQuery.isError || !vaultQuery.data) {
    return <p className="text-sm text-destructive">Unable to load vault settings.</p>;
  }

  const vault = vaultQuery.data.vault;

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const normalizedName = name.trim() || vault.name;
    renameMutation.mutate({ vaultId, name: normalizedName });
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const userId = inviteUserId.trim();
    if (!userId) {
      setErrorMessage('User ID is required.');
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
    <section className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Vault settings</h2>
          <p className="text-sm text-muted-foreground">{vault.name} • {vault.id}</p>
        </div>
        <Link to="/vaults" className="text-sm font-medium text-primary hover:underline">Back to vault list</Link>
      </div>

      {statusMessage ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">{statusMessage}</p> : null}
      {errorMessage ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Rename vault</h3>
        <form className="mt-4 space-y-4" onSubmit={handleRename}>
          <input
            type="text"
            defaultValue={vault.name}
            onChange={event => setName(event.target.value)}
            className="h-10 w-full max-w-xl rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={renameMutation.isPending}>
            {renameMutation.isPending ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Invite member</h3>
        <p className="mt-1 text-sm text-muted-foreground">Invite by user id and assign initial permissions.</p>
        <form className="mt-4 space-y-4" onSubmit={handleInvite}>
          <input
            type="text"
            value={inviteUserId}
            onChange={event => setInviteUserId(event.target.value)}
            placeholder="usr_..."
            className="h-10 w-full max-w-xl rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={!canManageMembers}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            {VAULT_MEMBER_PERMISSIONS.map(permission => (
              <label key={permission} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={invitePermissions.includes(permission)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setInvitePermissions(current => [...new Set([...current, permission])]);
                    }
                    else {
                      setInvitePermissions(current => current.filter(item => item !== permission));
                    }
                  }}
                  disabled={!canManageMembers}
                />
                {permission}
              </label>
            ))}
          </div>

          <Button type="submit" disabled={!canManageMembers || inviteMutation.isPending}>
            {inviteMutation.isPending ? 'Inviting…' : 'Invite member'}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Members & permissions</h3>
        {membersQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading members…</p> : null}
        {membersQuery.isError ? <p className="mt-3 text-sm text-destructive">Unable to load members.</p> : null}

        <ul className="mt-4 space-y-4">
          {members.map(member => (
            <li key={member.userId} className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{member.name ?? member.email}</p>
                  <p className="text-xs text-muted-foreground">{member.userId} • {member.role}</p>
                </div>
                {member.role === 'member' ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManageMembers || removeMemberMutation.isPending}
                    onClick={() => removeMemberMutation.mutate({ vaultId, memberUserId: member.userId })}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>

              {member.role === 'member' ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setStatusMessage(null);
                    setErrorMessage(null);

                    const permissions = collectPermissions(event.currentTarget);
                    updateMemberMutation.mutate({
                      vaultId,
                      memberUserId: member.userId,
                      role: 'member',
                      permissions,
                    });
                  }}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    {VAULT_MEMBER_PERMISSIONS.map(permission => (
                      <label key={`${member.userId}-${permission}`} className="flex items-center gap-2 text-sm">
                        <input
                          name="permissions"
                          type="checkbox"
                          value={permission}
                          defaultChecked={member.permissions.includes(permission)}
                          disabled={!canManageMembers}
                        />
                        {permission}
                      </label>
                    ))}
                  </div>

                  <Button type="submit" disabled={!canManageMembers || updateMemberMutation.isPending}>
                    {updateMemberMutation.isPending ? 'Saving…' : 'Save permissions'}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">Owner has full permissions.</p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Transfer ownership</h3>
        <p className="mt-1 text-sm text-muted-foreground">Promote a member to owner.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            className="h-10 w-full max-w-xl rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={transferTargetUserId}
            onChange={event => setTransferTargetUserId(event.target.value)}
            disabled={ownerCandidates.length === 0}
          >
            <option value="">Select member</option>
            {ownerCandidates.map(member => (
              <option key={member.userId} value={member.userId}>{member.name ?? member.email} ({member.userId})</option>
            ))}
          </select>
          <Button
            type="button"
            disabled={transferTargetUserId.length === 0 || transferMutation.isPending || vault.role !== 'owner'}
            onClick={() => {
              setStatusMessage(null);
              setErrorMessage(null);
              transferMutation.mutate({ vaultId, userId: transferTargetUserId });
            }}
          >
            {transferMutation.isPending ? 'Transferring…' : 'Transfer ownership'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-destructive/40 bg-card p-6">
        <h3 className="text-lg font-semibold text-destructive">Danger zone</h3>
        <p className="mt-1 text-sm text-muted-foreground">Delete this vault permanently from active view.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={deleteMutation.isPending || vault.role !== 'owner'}
          onClick={() => {
            setStatusMessage(null);
            setErrorMessage(null);
            deleteMutation.mutate({ vaultId });
          }}
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete vault'}
        </Button>
      </div>
    </section>
  );
}

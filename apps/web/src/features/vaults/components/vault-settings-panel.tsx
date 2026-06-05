import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Box, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Users, Vault } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import {
  StatCard,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import {
  DeleteButton,
  SaveButton,
} from '@/components/ui/action-buttons';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMeQuery } from '@/features/me/me.queries';
import {
  deleteVault,
  renameVault,
} from '@/features/vaults/vaults.api';
import {
  useVaultMembersQuery,
  useVaultQuery,
  vaultQueryKeys,
} from '@/features/vaults/vaults.queries';
import { formatAiAccess, formatVaultRole } from '@/features/vaults/components/vault-member-formatters';

function isRequestResponse<T extends object>(value: T | { request: unknown }): value is { request: unknown } {
  return 'request' in value;
}

export function VaultSettingsPanel({ vaultId }: { vaultId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const vaultQuery = useVaultQuery({ vaultId });
  const meQuery = useMeQuery();
  const membersQuery = useVaultMembersQuery({ vaultId });
  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data?.members]);

  const [detailsDraft, setDetailsDraft] = useState<{
    vaultId: string;
    name: string;
    description: string;
  } | null>(null);
  const draftMatchesVault = detailsDraft?.vaultId === vaultId;
  const name = draftMatchesVault ? detailsDraft.name : vaultQuery.data?.vault.name ?? '';
  const description = draftMatchesVault
    ? detailsDraft.description
    : vaultQuery.data?.vault.description ?? '';

  const canManageVault = vaultQuery.data?.vault.role === 'owner';

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
        toast.success('Vault deletion request queued for admin approval.');
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
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = name.trim() || vault.name;
    renameMutation.mutate({
      vaultId,
      name: normalizedName,
      description: description.trim() || null,
    });
  }

  return (
    <Stack gap="8">
      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}>
        <StatCard
          label="Your role"
          value={formatVaultRole(vault.role, vault.isAdmin)}
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
          value={aiFeaturesEnabled ? formatAiAccess(vault.aiAccessLevel) : 'Disabled'}
          meta={
            !aiFeaturesEnabled
              ? 'AI features are disabled for this Arkivra instance.'
              : vault.aiAccessLevel === 'full'
              ? 'Semantic search and vault chat are available.'
              : vault.aiAccessLevel === 'document_chat'
                ? 'Document chat is available.'
                : 'Admin status does not grant AI access.'
          }
          icon={<Vault size={20} />}
        />
      </Grid>

      <Grid gap="6" templateColumns={{ base: '1fr', xl: '1.1fr 0.9fr' }}>
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
              {renameMutation.isPending ? 'Saving...' : 'Save'}
            </SaveButton>
          </chakra.form>
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
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </DeleteButton>
        </SurfacePanel>
      </Grid>
    </Stack>
  );
}

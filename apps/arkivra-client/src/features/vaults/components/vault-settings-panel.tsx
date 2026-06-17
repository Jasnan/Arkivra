import type { FormEvent } from 'react';
import { useState } from 'react';
import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Trash2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  deleteVault,
  renameVault,
} from '@/features/vaults/vaults.api';
import {
  useVaultQuery,
  vaultQueryKeys,
} from '@/features/vaults/vaults.queries';

function isRequestResponse<T extends object>(value: T | { request: unknown }): value is { request: unknown } {
  return 'request' in value;
}

export function VaultSettingsPanel({ vaultId }: { vaultId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const vaultQuery = useVaultQuery({ vaultId });

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
    <Stack gap="5" maxW="6xl" w="full">
      <Stack gap="1.5">
        <Text as="h2" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" lineHeight="short" color="fg">
          Settings
        </Text>
        <Text fontSize="sm" fontWeight="medium" color="fg.muted">
          Manage your vault settings.
        </Text>
      </Stack>

      <Box
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        px={{ base: '4', md: '5' }}
        py={{ base: '5', md: '6' }}
      >
        <chakra.form onSubmit={handleRename}>
          <Grid
            gap={{ base: '5', lg: '6' }}
            alignItems={{ base: 'stretch', lg: 'start' }}
            templateColumns={{ base: '1fr', lg: '13rem minmax(0, 1fr)' }}
          >
            <Flex gap="4" align="flex-start">
              <Flex
                boxSize="10"
                shrink="0"
                align="center"
                justify="center"
                rounded="full"
                borderWidth="1px"
                borderColor="green.muted"
                bg="green.subtle"
                color="green.fg"
              >
                <ClipboardList size={20} />
              </Flex>
              <Box minW="0">
                <Text fontSize="sm" fontWeight="bold" color="fg">
                  General
                </Text>
                <Text mt="1" fontSize="sm" fontWeight="medium" lineHeight="short" color="fg.muted">
                  Update the basic information about this vault.
                </Text>
              </Box>
            </Flex>

            <Grid
              gap={{ base: '4', md: '5' }}
              alignItems="end"
              templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) minmax(0, 1.4fr) auto' }}
            >
              <Field>
                <FieldLabel htmlFor="vault-settings-name">Vault name</FieldLabel>
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
                    })}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="vault-settings-description">Description (optional)</FieldLabel>
                <Input
                  id="vault-settings-description"
                  type="text"
                  value={description}
                  disabled={!canManageVault}
                  onChange={(event) =>
                    setDetailsDraft({
                      vaultId,
                      name,
                      description: event.target.value,
                    })}
                  placeholder="What belongs in this vault?"
                />
              </Field>

              <Button
                type="submit"
                minW={{ base: 'full', xl: '9rem' }}
                disabled={!canManageVault || renameMutation.isPending}
              >
                {renameMutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </Grid>
          </Grid>
        </chakra.form>
      </Box>

      <Box
        rounded="lg"
        borderWidth="1px"
        borderColor="red.muted"
        bg="red.subtle/20"
        px={{ base: '4', md: '5' }}
        py={{ base: '5', md: '6' }}
      >
        <Grid
          gap={{ base: '5', lg: '6' }}
          alignItems={{ base: 'stretch', lg: 'center' }}
          templateColumns={{ base: '1fr', lg: '13rem minmax(0, 1fr) auto' }}
        >
          <Flex gap="4" align="flex-start">
            <Flex
              boxSize="10"
              shrink="0"
              align="center"
              justify="center"
              rounded="full"
              borderWidth="1px"
              borderColor="red.muted"
              bg="red.subtle"
              color="red.fg"
            >
              <Trash2 size={20} />
            </Flex>
            <Box minW="0">
              <Text fontSize="sm" fontWeight="bold" color="fg">
                Danger zone
              </Text>
              <Text mt="1" fontSize="sm" fontWeight="medium" lineHeight="short" color="fg.muted">
                These actions cannot be undone.
              </Text>
            </Box>
          </Flex>

          <Text fontSize="sm" fontWeight="medium" color="fg.muted">
            Delete this vault permanently and remove all data.
          </Text>

          <Button
            type="button"
            variant="outline"
            colorPalette="red"
            minW={{ base: 'full', lg: '8.5rem' }}
            disabled={deleteMutation.isPending || !canManageVault}
            onClick={() => {
              deleteMutation.mutate({ vaultId });
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete vault'}
          </Button>
        </Grid>
      </Box>
    </Stack>
  );
}

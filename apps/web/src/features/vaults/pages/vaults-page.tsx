import type { FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, Heading, Stack, Text, CloseButton, Dialog as ChakraDialog, Portal } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, FolderOpen, Settings2, ShieldCheck, Vault } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PageIntro,
  SectionTitle,
  StatCard,
  SurfacePanel,
  EmptyState,
} from '@/components/layout/vault-ui';
import { CreateButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import { createVault } from '@/features/vaults/vaults.api';
import { useVaultsQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';

function formatVaultCreatedDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatVaultRole(role: string | null | undefined) {
  if (role === 'owner') {
    return 'Owner';
  }

  if (role === 'member') {
    return 'Member';
  }

  if (role === 'global_admin') {
    return 'Global admin';
  }

  return 'Access';
}

function getVaultDescription(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === 'Credise default vault') {
    return 'Default vault';
  }

  return value;
}

export function VaultsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const vaults = useMemo(() => vaultsQuery.data?.vaults ?? [], [vaultsQuery.data?.vaults]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const canCreateVault = meQuery.data?.canCreateVault === true;
  const createButtonRef = useRef<HTMLButtonElement | null>(null);

  const ownedVaults = useMemo(
    () => vaults.filter((vault) => vault.role === 'owner').length,
    [vaults],
  );
  const memberVaults = Math.max(0, vaults.length - ownedVaults);

  const createMutation = useMutation({
    mutationFn: createVault,
    onSuccess: async ({ vault }) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      setIsCreateModalOpen(false);
      setName('');
      setDescription('');
      toast.success('Vault created.');
      navigate(`/vaults/${vault.id}/settings`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create vault.');
    },
  });

  function restoreCreateButtonFocus() {
    const button = createButtonRef.current;
    if (button) {
      requestAnimationFrame(() => {
        button.focus();
      });
    }
  }

  function openCreateModal() {
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (createMutation.isPending) {
      return;
    }

    setIsCreateModalOpen(false);
    setName('');
    setDescription('');
    restoreCreateButtonFocus();
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateVault) {
      toast.error(
        'A global admin must grant vault creation before this account can create a workspace.',
      );
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error('Vault name is required.');
      return;
    }

    createMutation.mutate({
      name: normalizedName,
      description: description.trim() || null,
    });
  }

  function getDescriptionPreview(value: string) {
    if (value.length <= 280) {
      return value;
    }

    return `${value.slice(0, 277).trimEnd()}...`;
  }

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        title="Vaults"
        description="Manage and access your vaults."
        actions={
          meQuery.data?.canCreateVault ? (
            <CreateButton ref={createButtonRef} onClick={openCreateModal}>
              Create vault
            </CreateButton>
          ) : undefined
        }
      />

      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))' }}>
        <StatCard
          label="Vaults"
          value={vaults.length}
          icon={<Vault size={20} />}
        />
        <StatCard
          label="Owned"
          value={ownedVaults}
          icon={<ShieldCheck size={20} />}
        />
        <StatCard
          label="Shared"
          value={memberVaults}
          icon={<FolderKanban size={20} />}
        />
      </Grid>

      <SurfacePanel display="flex" flexDirection="column" gap="5">
        <SectionTitle
          eyebrow="Vaults"
          title={`${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'}`}
        />

        {vaultsQuery.isLoading ? (
          <Text textStyle="metadata">Loading vaults...</Text>
        ) : null}
        {vaultsQuery.isError ? (
          <Text textStyle="metadata" color="status.danger">Unable to load vaults.</Text>
        ) : null}

        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <EmptyState
            description={
              meQuery.data?.canCreateVault
                ? 'No vaults yet. Create your first vault to start storing documents.'
                : 'No vaults available yet. A global admin must grant vault creation before you can open a new workspace.'
            }
          />
        ) : (
          <Grid gap="5" templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}>
            {vaults.map((vault) => (
              <Box
                key={vault.id}
                as="article"
                role="link"
                tabIndex={0}
                display="flex"
                h="full"
                cursor="pointer"
                flexDirection="column"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="surface.default"
                p={{ base: '4', sm: '5' }}
                transition="background-color 0.15s ease, border-color 0.15s ease"
                _hover={{ bg: 'surface.subtle' }}
                _focus={{ outline: 'none', boxShadow: '0 0 0 2px var(--chakra-colors-border-focus)' }}
                onClick={() => navigate(`/vaults/${vault.id}/documents`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/vaults/${vault.id}/documents`);
                  }
                }}
              >
                <Flex h="full" minH="40" gap="4">
                    <Flex mt="0.5" boxSize="10" shrink="0" align="center" justify="center" rounded="lg" bg="accent.subtle" color="accent.fg">
                      <FolderOpen size={18} />
                    </Flex>
                  <Stack minW="0" flex="1" gap="0">
                    <Flex align="flex-start" justify="space-between" gap="4">
                      <Heading as="h2" truncate fontSize="md" fontWeight="semibold" lineHeight="tight" color="text.default">
                        {vault.name}
                      </Heading>
                      <Flex shrink="0" align="flex-start" gap="2">
                      <Flex
                        display="inline-flex"
                        align="center"
                        gap="1.5"
                        rounded="md"
                        borderWidth="1px"
                        borderColor="border.subtle"
                        bg="surface.subtle"
                        px="2.5"
                        py="1"
                        fontSize="xs"
                        fontWeight="medium"
                        color="text.muted"
                        shrink="0"
                      >
                        {formatVaultRole(vault.role)}
                      </Flex>
                        <Box
                          position="relative"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <ActionMenuTriggerButton label={`Vault actions for ${vault.name}`} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" minWidth="9rem">
                              <DropdownMenuItem
                                onSelect={() => navigate(`/vaults/${vault.id}/settings`)}
                              >
                                <ActionMenuItemIcon icon={Settings2} />
                                Settings
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Box>
                      </Flex>
                    </Flex>
                    {getVaultDescription(vault.description) ? (
                      <Text mt="2" textStyle="body" color="text.muted">
                        {getDescriptionPreview(getVaultDescription(vault.description) ?? '')}
                      </Text>
                    ) : null}
                    <Box mt="auto" pt="4">
                      <Text fontSize="sm" fontWeight="medium" color="text.muted">
                        {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'} •{' '}
                        {formatBytes(vault.totalSize)}
                      </Text>
                      <Text mt="1" textStyle="metadata">
                        Created {formatVaultCreatedDate(vault.createdAt)}
                      </Text>
                    </Box>
                  </Stack>
                </Flex>
              </Box>
            ))}
          </Grid>
        )}
      </SurfacePanel>

      <ChakraDialog.Root
        open={isCreateModalOpen}
        onOpenChange={(e) => { if (!e.open && !createMutation.isPending) closeCreateModal(); }}
        size={{ mdDown: 'full', md: 'lg' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>New vault</ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <form id="create-vault-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleCreateSubmit}>
                  <Field>
                    <FieldLabel htmlFor="create-vault-name">Name</FieldLabel>
                    <Input id="create-vault-name" type="text" required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Personal Vault" />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-vault-description">Description</FieldLabel>
                    <Textarea id="create-vault-description" value={description} onChange={(event) => setDescription(event.target.value)} minH="6rem" resize="vertical" placeholder="Optional" />
                    <FieldDescription>Optional context to help identify this vault later.</FieldDescription>
                  </Field>

                  {!canCreateVault ? (
                    <Text fontSize="sm" color="text.muted">
                      Vault creation is currently disabled for this account.
                    </Text>
                  ) : null}
                </form>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" onClick={closeCreateModal} disabled={createMutation.isPending}>
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                <CreateButton type="button" disabled={createMutation.isPending} onClick={() => { (document.getElementById('create-vault-form') as HTMLFormElement)?.requestSubmit(); }}>
                  {createMutation.isPending ? 'Creating...' : 'Create vault'}
                </CreateButton>
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>
    </Stack>
  );
}

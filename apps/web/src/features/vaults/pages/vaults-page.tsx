import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, HStack, Stack, Text, CloseButton, Dialog as ChakraDialog, Portal, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, FolderOpen, Grid3X3, List, Settings2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader, useWorkspaceSecondary } from '@/components/layout/workspace-context';
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
import type { VaultSummary } from '@/features/vaults/vaults.types';

type VaultsView = 'list' | 'grid';

const VAULTS_VIEW_STORAGE_KEY = 'arkivra.vaults.view';

type VaultContextMenuState = {
  vault: VaultSummary;
  x: number;
  y: number;
} | null;

interface VaultAction {
  key: string;
  label: string;
  icon: typeof FolderOpen;
  onSelect: () => void;
}

function getStoredVaultsView(): VaultsView {
  if (typeof window === 'undefined') {
    return 'list';
  }

  try {
    return window.localStorage?.getItem?.(VAULTS_VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

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

function VaultContextMenu({
  state,
  actions,
  onClose,
}: {
  state: Exclude<VaultContextMenuState, null>;
  actions: VaultAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function closeOnOutsideContextMenu(event: globalThis.MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, { capture: true });
    window.document.addEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
    window.document.addEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, { capture: true });
      window.document.removeEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
      window.document.removeEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });
    };
  }, [onClose]);

  return (
    <Portal>
      <Box
        ref={menuRef}
        role="menu"
        aria-label={`Vault actions for ${state.vault.name}`}
        position="fixed"
        zIndex="popover"
        minW="12rem"
        left={`${state.x}px`}
        top={`${state.y}px`}
        rounded="lg"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.surface"
        p="1.5"
        shadow="xl"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {actions.map((action) => (
          <chakra.button
            key={action.key}
            type="button"
            role="menuitem"
            display="flex"
            w="full"
            alignItems="center"
            gap="3"
            rounded="md"
            px="3"
            py="2"
            textAlign="left"
            fontSize="sm"
            fontWeight="medium"
            color="fg.muted"
            _hover={{ bg: 'bg.subtle', color: 'fg' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
            onClick={() => {
              onClose();
              window.setTimeout(action.onSelect, 0);
            }}
          >
            <ActionMenuItemIcon icon={action.icon} />
            {action.label}
          </chakra.button>
        ))}
      </Box>
    </Portal>
  );
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
  const [contextMenu, setContextMenu] = useState<VaultContextMenuState>(null);
  const [vaultsView, setVaultsView] = useState<VaultsView>(() => getStoredVaultsView());
  const canCreateVault = meQuery.data?.canCreateVault === true;
  const createButtonRef = useRef<HTMLButtonElement | null>(null);

  const createMutation = useMutation({
    mutationFn: createVault,
    onSuccess: async ({ vault }) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      setIsCreateModalOpen(false);
      setName('');
      setDescription('');
      toast.success('Vault created.');
      navigate({ to: ROUTES.vaultSettings(vault.id) });
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

  useEffect(() => {
    try {
      window.localStorage?.setItem?.(VAULTS_VIEW_STORAGE_KEY, vaultsView);
    } catch {}
  }, [vaultsView]);

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
    if (value.length <= 120) {
      return value;
    }

    return `${value.slice(0, 117).trimEnd()}...`;
  }

  function getVaultActions(vault: VaultSummary): VaultAction[] {
    return [
      { key: 'open', label: 'Open', icon: FolderOpen, onSelect: () => navigate({ to: ROUTES.vaultRoot(vault.id) }) },
      { key: 'settings', label: 'Settings', icon: Settings2, onSelect: () => navigate({ to: ROUTES.vaultSettings(vault.id) }) },
    ];
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, vault: VaultSummary) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      vault,
      x: Math.min(event.clientX, window.innerWidth - 192),
      y: Math.min(event.clientY, window.innerHeight - 160),
    });
  }

  const workspaceHeader = useMemo(() => ({
    actions: (
      <HStack gap="2">
        <Button
          type="button"
          size="icon"
          variant={vaultsView === 'list' ? 'solid' : 'ghost'}
          aria-label="List view"
          onClick={() => setVaultsView('list')}
        >
          <List size={17} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={vaultsView === 'grid' ? 'solid' : 'ghost'}
          aria-label="Grid view"
          onClick={() => setVaultsView('grid')}
        >
          <Grid3X3 size={17} />
        </Button>
      </HStack>
    ),
  }), [vaultsView]);
  useWorkspaceHeader(workspaceHeader);
  const isInWorkspaceShell = useWorkspaceSecondary(null);

  return (
    <Stack as="section" gap="0" h="full" minH="0">
      {!isInWorkspaceShell && canCreateVault ? (
        <Box px={{ base: '4', lg: '6' }} pt={{ base: '4', lg: '6' }} pb="4">
          <Flex justify="flex-start">
            <CreateButton ref={createButtonRef} onClick={openCreateModal}>
              Create vault
            </CreateButton>
          </Flex>
        </Box>
      ) : null}

      <Box flex="1" minH="0" overflowY="auto" px={{ base: '4', lg: '6' }} py={isInWorkspaceShell ? '4' : '0'}>
        {vaultsQuery.isLoading ? (
          <Text px="3" py="4" textStyle="sm">Loading vaults...</Text>
        ) : null}
        {vaultsQuery.isError ? (
          <Text px="3" py="4" textStyle="sm" color="fg.error">Unable to load vaults.</Text>
        ) : null}

        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <Flex minH="44" align="center" justify="center" textAlign="center">
            <Text maxW="sm" fontSize="sm" color="fg.muted">
              {meQuery.data?.canCreateVault
                ? 'No vaults yet. Create your first vault to start storing documents.'
                : 'No vaults available yet. A global admin must grant vault creation before you can open a new workspace.'}
            </Text>
          </Flex>
        ) : vaultsView === 'grid' ? (
          <Grid gap="4" templateColumns={{ base: 'repeat(1, minmax(0, 1fr))', md: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
            {vaults.map((vault) => (
              <Flex
                key={vault.id}
                as="article"
                role="link"
                tabIndex={0}
                position="relative"
                direction="column"
                align="center"
                justify="center"
                minH="13rem"
                cursor="pointer"
                rounded="md"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.workspace"
                px="5"
                py="4"
                textAlign="center"
                transition="background-color 0.15s ease, border-color 0.15s ease"
                _hover={{ bg: 'bg.workspaceMuted', borderColor: 'border.strong' }}
                _focus={{ outline: 'none', boxShadow: '0 0 0 2px var(--chakra-colors-border-focus)' }}
                onClick={() => navigate({ to: ROUTES.vaultRoot(vault.id) })}
                onContextMenu={(event) => openContextMenu(event, vault)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate({ to: ROUTES.vaultRoot(vault.id) });
                  }
                }}
              >
                <Box
                  position="absolute"
                  top="3"
                  right="3"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <ActionMenuTriggerButton label={`Vault actions for ${vault.name}`} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" minWidth="9rem">
                      <DropdownMenuItem onSelect={() => navigate({ to: ROUTES.vaultSettings(vault.id) })}>
                        <ActionMenuItemIcon icon={Settings2} />
                        Settings
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Box>

                <Flex boxSize="16" align="center" justify="center" color="teal.fg">
                  <FolderKanban size={48} strokeWidth={1.7} />
                </Flex>
                <Text mt="4" maxW="full" truncate fontSize="md" fontWeight="semibold" color="fg">
                  {vault.name}
                </Text>
                {getVaultDescription(vault.description) ? (
                  <Text mt="1" maxW="full" truncate fontSize="sm" color="fg.muted">
                    {getDescriptionPreview(getVaultDescription(vault.description) ?? '')}
                  </Text>
                ) : null}
                <Text mt="3" fontSize="sm" color="fg.muted">
                  {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'} • {formatBytes(vault.totalSize)}
                </Text>
              </Flex>
            ))}
          </Grid>
        ) : (
          <Stack gap="0" borderTopWidth={vaults.length > 0 ? '1px' : '0'} borderColor="border.subtle">
            {vaults.map((vault) => (
              <Flex
                key={vault.id}
                as="article"
                role="link"
                tabIndex={0}
                align="center"
                gap="4"
                minH="4.5rem"
                cursor="pointer"
                borderBottomWidth="1px"
                borderColor="border.subtle"
                bg="bg.workspace"
                px="3"
                py="3"
                transition="background-color 0.15s ease, border-color 0.15s ease"
                _hover={{ bg: 'bg.workspaceMuted' }}
                _focus={{ outline: 'none', boxShadow: '0 0 0 2px var(--chakra-colors-border-focus)' }}
                onClick={() => navigate({ to: ROUTES.vaultRoot(vault.id) })}
                onContextMenu={(event) => openContextMenu(event, vault)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate({ to: ROUTES.vaultRoot(vault.id) });
                  }
                }}
              >
                <Flex boxSize="10" shrink="0" align="center" justify="center" color="teal.fg">
                  <FolderKanban size={24} strokeWidth={1.8} />
                </Flex>

                <Stack minW="0" flex="1" gap="1">
                  <Flex align="center" gap="3" minW="0">
                    <Text truncate fontSize="md" fontWeight="semibold" color="fg">
                      {vault.name}
                    </Text>
                    <Flex
                      display={{ base: 'none', sm: 'inline-flex' }}
                      align="center"
                      gap="1.5"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.subtle"
                      bg="bg.workspaceMuted"
                      px="2.5"
                      py="1"
                      fontSize="xs"
                      fontWeight="medium"
                      color="fg.muted"
                      shrink="0"
                    >
                      {formatVaultRole(vault.role)}
                    </Flex>
                  </Flex>
                  {getVaultDescription(vault.description) ? (
                    <Text truncate fontSize="sm" color="fg.muted">
                      {getDescriptionPreview(getVaultDescription(vault.description) ?? '')}
                    </Text>
                  ) : null}
                </Stack>

                <Flex
                  display={{ base: 'none', md: 'flex' }}
                  direction="column"
                  align="flex-start"
                  w="11rem"
                  shrink="0"
                  color="fg.muted"
                >
                  <Text fontSize="sm" fontWeight="medium">
                    {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'} • {formatBytes(vault.totalSize)}
                  </Text>
                  <Text mt="1" fontSize="sm">
                    Created {formatVaultCreatedDate(vault.createdAt)}
                  </Text>
                </Flex>

                <Box
                  position="relative"
                  flexShrink="0"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <ActionMenuTriggerButton label={`Vault actions for ${vault.name}`} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" minWidth="9rem">
                      <DropdownMenuItem
                        onSelect={() => navigate({ to: ROUTES.vaultSettings(vault.id) })}
                      >
                        <ActionMenuItemIcon icon={Settings2} />
                        Settings
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Box>
              </Flex>
            ))}
          </Stack>
        )}
      </Box>

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
                    <Text fontSize="sm" color="fg.muted">
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

      {contextMenu !== null ? (
        <VaultContextMenu
          state={contextMenu}
          actions={getVaultActions(contextMenu.vault)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Stack>
  );
}

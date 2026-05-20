import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderDot, FolderOpen, Info, Settings2, Vault } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader, useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { CreateButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes } from '@/features/documents/documents.utils';
import { FileBrowserViewToggle } from '@/features/file-browser/components/file-browser-view-toggle';
import { usePreferredFileBrowserView } from '@/features/file-browser/components/use-preferred-file-browser-view';
import { useMeQuery } from '@/features/me/me.queries';
import { createVault } from '@/features/vaults/vaults.api';
import { useVaultsQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';
import type { VaultSummary } from '@/features/vaults/vaults.types';

const VAULTS_LIST_GRID_COLUMNS = 'minmax(0, 1fr) 7rem 4rem 5.75rem 7.5rem 2.5rem';

type VaultContextMenuState = {
  vault: VaultSummary;
  x: number;
  y: number;
} | null;

function isRequestResponse(value: unknown): value is { request: { id: string } } {
  return typeof value === 'object' && value !== null && 'request' in value;
}

interface VaultAction {
  key: string;
  label: string;
  icon: typeof FolderOpen;
  onSelect: () => void;
}

function formatVaultDate(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
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

function getParticipationLabel(vault: VaultSummary) {
  if (vault.role === 'owner') return 'Owner';
  if (vault.role === 'editor') return 'Editor';
  if (vault.role === 'viewer') return 'Viewer';
  return 'No participation';
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
        borderColor="border.surface"
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
  const [vaultsView, setVaultsView] = usePreferredFileBrowserView();
  const canCreateVault = meQuery.data?.canCreateVault === true;
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const shouldRestoreCreateButtonFocusRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: createVault,
    onSuccess: async (result) => {
      if (isRequestResponse(result)) {
        setIsCreateModalOpen(false);
        setName('');
        setDescription('');
        queueCreateButtonFocusRestore();
        toast.success('Vault creation request queued for admin approval.');
        return;
      }

      const { vault } = result;
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

  function queueCreateButtonFocusRestore() {
    shouldRestoreCreateButtonFocusRef.current = true;
  }

  function restoreCreateButtonFocus() {
    const button = createButtonRef.current;
    if (button) {
      button.focus();
      requestAnimationFrame(() => {
        window.setTimeout(() => button.focus(), 0);
      });
    }
  }

  useEffect(() => {
    if (isCreateModalOpen || !shouldRestoreCreateButtonFocusRef.current) {
      return;
    }

    window.setTimeout(() => createButtonRef.current?.focus(), 0);
  }, [isCreateModalOpen]);

  function closeCreateModal() {
    if (createMutation.isPending) {
      return;
    }

    setIsCreateModalOpen(false);
    setName('');
    setDescription('');
    queueCreateButtonFocusRestore();
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

  const vaultHeaderActions = useMemo(() => (
    <HStack gap="2">
      <CreateButton ref={createButtonRef} onClick={() => setIsCreateModalOpen(true)}>
        Create vault
      </CreateButton>
      <FileBrowserViewToggle value={vaultsView} onValueChange={setVaultsView} />
    </HStack>
  ), [vaultsView, setVaultsView]);
  const workspaceHeader = useMemo(() => ({
    actions: vaultHeaderActions,
  }), [vaultHeaderActions]);
  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);
  useWorkspaceSecondary(null);

  return (
    <Stack as="section" gap="0" h="full" minH="0">
      {!isInWorkspaceShell ? (
        <Flex
          as="header"
          align="center"
          justify="flex-end"
          gap="3"
          borderBottomWidth="1px"
          borderColor="border.surface"
          bg="bg.workspace"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          {vaultHeaderActions}
        </Flex>
      ) : null}

      <Box
        flex="1"
        minH="0"
        overflowY="auto"
        px={vaultsView === 'grid' ? { base: '4', lg: '6' } : '0'}
        py={vaultsView === 'grid' && isInWorkspaceShell ? '4' : '0'}
      >
        {vaultsQuery.isLoading ? (
          <Text px="3" py="4" textStyle="sm">Loading vaults...</Text>
        ) : null}
        {vaultsQuery.isError ? (
          <Text px="3" py="4" textStyle="sm" color="fg.error">Unable to load vaults.</Text>
        ) : null}

        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <CenteredEmptyState
            title="No vaults yet"
            description={
              meQuery.data?.canCreateVault
                ? 'Create your first vault to start storing documents.'
                : 'No vaults available yet. Request a vault and an admin can approve it.'
            }
            icon={<Vault size={32} />}
            containerProps={{ h: 'full', minH: '22rem' }}
          />
        ) : vaultsView === 'grid' ? (
          <Grid gap="var(--arkivra-gridItemGap, 2rem)" templateColumns={{ base: 'repeat(1, minmax(0, 1fr))', md: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
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
                minH="var(--arkivra-gridItemHeight, 14rem)"
                cursor="pointer"
                rounded="md"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.workspace"
                px="5"
                py="var(--arkivra-gridItemPadding, 1.25rem)"
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
                  <Vault size={48} strokeWidth={1.7} />
                </Flex>
                <Text mt="4" maxW="full" truncate fontSize="md" fontWeight="semibold" color="fg">
                  {vault.name}
                </Text>
                <Text
                  mt="1"
                  maxW="full"
                  minH="5"
                  truncate
                  fontSize="sm"
                  color="fg.muted"
                  visibility={getVaultDescription(vault.description) ? 'visible' : 'hidden'}
                >
                  {getDescriptionPreview(getVaultDescription(vault.description) ?? 'Description')}
                </Text>
                <Text mt="3" fontSize="sm" color="fg.muted">
                  {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'} • {formatBytes(vault.totalSize)}
                </Text>
                <Text mt="1" fontSize="xs" fontWeight="semibold" color={vault.role === null ? 'fg.warning' : 'fg.muted'}>
                  {getParticipationLabel(vault)}
                </Text>
              </Flex>
            ))}
          </Grid>
        ) : (
          <Stack gap="0" borderColor="border.surface">
            {vaults.length > 0 ? (
              <Grid
                display={{ base: 'none', md: 'grid' }}
                templateColumns={VAULTS_LIST_GRID_COLUMNS}
                gap="3"
                position="sticky"
                top="0"
                zIndex="1"
                borderBottomWidth="1px"
                borderColor="border.surface"
                bg="bg.workspace"
                px="6"
                py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
                fontSize="sm"
                color="fg.muted"
              >
                <Text as="span">Name</Text>
                <Text as="span">Access</Text>
                <Text as="span">Files</Text>
                <Text as="span">Size</Text>
                <Text as="span">Modified</Text>
                <Text as="span" srOnly>Actions</Text>
              </Grid>
            ) : null}
            {vaults.map((vault) => (
              <Grid
                key={vault.id}
                as="article"
                role="link"
                tabIndex={0}
                alignItems="center"
                templateColumns={{ base: 'minmax(0, 1fr) auto', md: VAULTS_LIST_GRID_COLUMNS }}
                gap="3"
                h="var(--arkivra-listRowHeight, 4.5rem)"
                cursor="pointer"
                borderBottomWidth="1px"
                borderColor="border.surface"
                bg="bg.workspace"
                px="6"
                py="var(--arkivra-rowPaddingY, 0.875rem)"
                transition="background-color 0.15s ease, border-color 0.15s ease"
                _hover={{ bg: 'bg.workspaceMuted' }}
                _last={{ borderBottomWidth: '0' }}
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
                <Flex minW="0" align="center" gap="3">
                  <Flex boxSize="var(--arkivra-listIconSize, 2.5rem)" shrink="0" align="center" justify="center" color="teal.fg">
                    <Vault size={28} strokeWidth={1.5} />
                  </Flex>

                  <Stack minW="0" flex="1" gap="1">
                    <Text truncate fontSize="md" fontWeight="semibold" color="fg">
                      {vault.name}
                    </Text>
                    {getVaultDescription(vault.description) ? (
                      <Text truncate fontSize="sm" color="fg.muted">
                        {getDescriptionPreview(getVaultDescription(vault.description) ?? '')}
                      </Text>
                    ) : null}
                  </Stack>
                </Flex>

                <Text display={{ base: 'none', md: 'block' }} truncate fontSize="sm" fontWeight="semibold" color={vault.role === null ? 'fg.warning' : 'fg.muted'}>
                  {getParticipationLabel(vault)}
                </Text>

                <Flex
                  display={{ base: 'none', md: 'flex' }}
                  align="flex-start"
                  minW="0"
                  color="fg.muted"
                >
                  <Text truncate fontSize="sm" fontWeight="medium">
                    {vault.fileCount}
                  </Text>
                </Flex>

                <Text display={{ base: 'none', md: 'block' }} truncate fontSize="sm" color="fg.muted">
                  {formatBytes(vault.totalSize)}
                </Text>

                <Text display={{ base: 'none', md: 'block' }} truncate fontSize="sm" color="fg.muted">
                  {formatVaultDate(vault.updatedAt ?? vault.createdAt)}
                </Text>

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
              </Grid>
            ))}
          </Stack>
        )}
      </Box>

      <Dialog
        open={isCreateModalOpen}
        finalFocusEl={() => createButtonRef.current}
        onExitComplete={() => {
          if (!shouldRestoreCreateButtonFocusRef.current) {
            return;
          }

          shouldRestoreCreateButtonFocusRef.current = false;
          restoreCreateButtonFocus();
        }}
        onOpenChange={(open) => {
          if (!open && !createMutation.isPending) {
            closeCreateModal();
          }
        }}
      >
        <DialogContent maxW="40rem" w="calc(100vw - 2rem)" bg="bg.surface" p="0">
          <chakra.form id="create-vault-form" onSubmit={handleCreateSubmit}>
            <Box borderBottomWidth="1px" borderColor="border.surface" px="4" py="2" pr={{ base: '13', lg: '14' }}>
              <DialogHeader>
                <HStack gap="2.5" align="center">
                  <Flex boxSize="9" align="center" justify="center" rounded="md" bg="teal.subtle" color="teal.fg" flexShrink="0">
                    <FolderDot size={18} />
                  </Flex>
                  <Stack gap="0.5" minW="0">
                    <DialogTitle>New vault</DialogTitle>
                    <DialogDescription>
                      Create a new vault for organizing documents and access.
                    </DialogDescription>
                  </Stack>
                </HStack>
              </DialogHeader>
            </Box>

            <Stack gap="3" px="4" py="4" bg="bg.subtle">
              <Card rounded="xl" borderColor="border.surface" bg="bg.elevated" p="4" shadow="xs">
                <Stack gap="4">
                  <Field>
                    <FieldLabel htmlFor="create-vault-name">Vault name</FieldLabel>
                    <Input
                      id="create-vault-name"
                      type="text"
                      required
                      autoFocus
                      value={name}
                      placeholder="Personal Vault"
                      h="11"
                      borderColor="border.strong"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-vault-description">Description (optional)</FieldLabel>
                    <Textarea
                      id="create-vault-description"
                      value={description}
                      minH="6rem"
                      resize="vertical"
                      placeholder="Optional"
                      borderColor="border.strong"
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </Field>

                  {!canCreateVault ? (
                    <Text fontSize="sm" color="fg.muted">
                      Vault creation will be queued for admin approval.
                    </Text>
                  ) : null}
                </Stack>
              </Card>

              <HStack gap="2" align="start" color="fg.muted">
                <Box mt="0.5" flexShrink="0">
                  <Info size={16} />
                </Box>
                <Text textStyle="sm">
                  Vault permissions and member access can be configured after creation.
                </Text>
              </HStack>
            </Stack>

            <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.surface" px="4" py="3.5">
              <Flex align="center" justify="flex-end" gap="3" w="full">
                <Button type="button" variant="outline" h="12" px="6" onClick={closeCreateModal} disabled={createMutation.isPending}>
                  Cancel
                </Button>
                <CreateButton type="button" h="12" px="6" disabled={createMutation.isPending} onClick={() => { (document.getElementById('create-vault-form') as HTMLFormElement)?.requestSubmit(); }}>
                  {createMutation.isPending ? 'Submitting...' : canCreateVault ? 'Create vault' : 'Request vault'}
                </CreateButton>
              </Flex>
            </Box>
          </chakra.form>
        </DialogContent>
      </Dialog>

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

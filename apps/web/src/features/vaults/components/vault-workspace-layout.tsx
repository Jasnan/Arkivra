import type { MouseEvent } from 'react';
import { useState } from 'react';
import { Box, Flex, HStack, Text, chakra } from '@chakra-ui/react';
import { Outlet, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FolderOpen, History, MessageSquare, Settings2, Upload, Users } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { useFileBrowserMutations } from '@/features/documents/hooks/use-file-browser-mutations';
import { BrowserContextMenu } from '@/features/file-browser/components/vault-browser-components';
import type { BrowserContextMenuEntry, ContextMenuState } from '@/features/file-browser/components/vault-browser.types';
import { VaultBrowserDragDropProvider } from '@/features/file-browser/components/vault-browser-drag-drop-context';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { useUploadManagerState } from '@/features/uploads/use-upload-manager';
import { useMeQuery } from '@/features/me/me.queries';
import { canMutateVaultDocuments, canUseVaultChat } from '@/features/vaults/vault-permissions';
import { useVaultQuery, useVaultsQuery } from '@/features/vaults/vaults.queries';
import {
  VAULT_TREE_ROOT_VALUE,
  VaultSidebarTree,
} from './vault-sidebar-tree';

function openTransfersDrawer() {
  window.dispatchEvent(new Event('arkivra:transfers-open'));
}

function VaultWorkspaceUploadBanner({ documentRoute }: { documentRoute: boolean }) {
  const uploadState = useUploadManagerState();
  const uploadCount = uploadState.activeCount + uploadState.queuedCount;

  if (uploadCount === 0) {
    return null;
  }

  return (
    <Box pt={documentRoute ? '4' : '3'}>
      <chakra.button
        type="button"
        display="flex"
        w="full"
        alignItems="center"
        justifyContent="space-between"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.workspace"
        px="4"
        py="3"
        fontSize="sm"
        color="fg.muted"
        transition="colors"
        _hover={{ bg: 'bg.workspaceMuted', color: 'fg' }}
        onClick={openTransfersDrawer}
      >
        <HStack gap="3">
          <Flex boxSize="8" align="center" justify="center" color="fg">
            <Upload size={16} />
          </Flex>
          <Text>
            Uploading {uploadCount} file
            {uploadCount === 1 ? '' : 's'}
          </Text>
        </HStack>
        <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.12em">
          View queue
        </Text>
      </chakra.button>
    </Box>
  );
}

function VaultFileTreePanel({
  activeVaultId,
  currentFolderId,
  currentDocumentId,
}: {
  activeVaultId: string;
  currentFolderId: string | null;
  currentDocumentId?: string | null;
}) {
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const vaultQuery = useVaultQuery({ vaultId: activeVaultId });
  const vaults = vaultsQuery.data?.vaults ?? [];
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [vaultTreeExpandedValue, setVaultTreeExpandedValue] = useState<string[]>([VAULT_TREE_ROOT_VALUE]);
  const folderTreeQuery = useFolderTreeQuery({
    vaultId: activeVaultId,
    enabled: activeVaultId.length > 0,
  });
  const contextVaultId = contextMenu?.item.type === 'background' || contextMenu?.item.type === 'root'
    ? contextMenu.item.vaultId
    : activeVaultId;
  const canMoveItems = canMutateVaultDocuments(vaultQuery.data?.vault);
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;
  const {
    moveItemsMutation,
    itemMutationPending,
  } = useFileBrowserMutations({
    vaultId: activeVaultId,
    createFolderParentId: null,
    folderName: '',
    onClearSelection: () => {},
    onCreateFolderSuccess: () => {},
    onRenameSuccess: () => {},
    onMoveSuccess: () => {},
  });

  function getVaultContextMenuActions(vaultId: string): BrowserContextMenuEntry[] {
    const vault = vaults.find(item => item.id === vaultId) ?? vaultQuery.data?.vault;
    return [
      { key: 'open', label: 'Open', icon: FolderOpen, onSelect: () => navigate({ to: ROUTES.vaultRoot(vaultId) }) },
      { key: 'members', label: 'Members', icon: Users, onSelect: () => navigate({ to: ROUTES.vaultMembers(vaultId) }) },
      { key: 'activity', label: 'Activity', icon: History, onSelect: () => navigate({ to: ROUTES.vaultActivity(vaultId) }) },
      { key: 'settings', label: 'Settings', icon: Settings2, onSelect: () => navigate({ to: ROUTES.vaultSettings(vaultId) }) },
      ...(aiFeaturesEnabled && canUseVaultChat(vault)
        ? [{ key: 'chat', label: 'Chat', icon: MessageSquare, onSelect: () => navigate({ to: ROUTES.vaultChat(vaultId) }) }]
        : []),
    ];
  }

  function openVaultContextMenu(event: MouseEvent<HTMLElement>, vaultId: string) {
    const vault = vaults.find(item => item.id === vaultId);

    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item: {
        type: 'background',
        vaultId,
        folderId: null,
        name: vault?.name ?? 'Vault',
      },
      x: event.clientX,
      y: event.clientY,
    });
  }

  return (
    <Flex
      as="aside"
      aria-label="Vault file tree"
      w={{ base: 'full', md: '15.75rem', xl: '17rem' }}
      h={{ base: '12rem', md: 'full' }}
      maxH={{ base: '12rem', md: 'none' }}
      minW={{ base: '0', md: '15.75rem', xl: '17rem' }}
      shrink={0}
      direction="column"
      borderRightWidth={{ base: '0', md: '1px' }}
      borderBottomWidth={{ base: '1px', md: '0' }}
      borderColor="border.strong"
      boxShadow="none"
      bg="bg.sidebar"
      overflow="hidden"
    >
      <Box flex="1" minH="0" overflowY="auto" px="3" py="4" pr="2">
        <VaultSidebarTree
          vaults={vaultsQuery.data?.vaults ?? []}
          activeVaultId={activeVaultId}
          activeVaultRootOnly
          expandedValue={vaultTreeExpandedValue}
          onExpandedValueChange={setVaultTreeExpandedValue}
          currentFolderId={currentFolderId}
          currentDocumentId={currentDocumentId}
          folders={folderTreeQuery.data?.folders ?? []}
          documents={folderTreeQuery.data?.documents ?? []}
          onOpenVaultContextMenu={openVaultContextMenu}
          canMoveItems={canMoveItems}
          itemMutationPending={itemMutationPending}
          onMoveItems={moveItemsMutation.mutate}
        />
      </Box>
      {contextMenu ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getVaultContextMenuActions(contextVaultId)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Flex>
  );
}

export function VaultWorkspaceLayout() {
  const params = useParams({ strict: false }) as { vaultId?: string; documentId?: string };
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const activeVaultId = params.vaultId ?? '';
  const currentDocumentId = params.documentId ?? null;
  const currentFolderId = search.folderId ?? null;
  const contentPadding = currentDocumentId ? { base: '4', lg: '6' } : '0';

  return (
    <VaultBrowserDragDropProvider>
      <Flex h="full" minH="0" minW="0" direction={{ base: 'column', md: 'row' }} overflow="hidden">
        <VaultFileTreePanel
          activeVaultId={activeVaultId}
          currentFolderId={currentFolderId}
          currentDocumentId={currentDocumentId}
        />
        <Flex
          minW="0"
          flex="1"
          direction="column"
          overflow={currentDocumentId ? 'auto' : 'hidden'}
          px={contentPadding}
        >
          <VaultWorkspaceUploadBanner documentRoute={Boolean(currentDocumentId)} />
          <Outlet />
        </Flex>
      </Flex>
    </VaultBrowserDragDropProvider>
  );
}

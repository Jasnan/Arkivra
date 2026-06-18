import type { DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { Box, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { Folder, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import {
  BrowserCurrentFolderDropZone,
  BrowserItemGrid,
  BrowserItemList,
} from '@/features/file-browser/components/vault-browser-components';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserDropTarget,
  BrowserItem,
  FileBrowserView,
} from '@/features/file-browser/components/vault-browser.types';
import type { AiAccessLevel, VaultDetail, VaultRole } from '@/features/vaults/vaults.types';
import { AdminJoinVaultDialog } from './documents-page-dialogs';

export function RestrictedAdminVaultOverview({
  vault,
  open,
  canDismiss,
  role,
  aiAccessLevel,
  isPending,
  onAiAccessLevelChange,
  onJoinClick,
  onOpenChange,
  onRoleChange,
  onSubmit,
}: {
  vault: VaultDetail;
  open: boolean;
  canDismiss: boolean;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
  isPending: boolean;
  onAiAccessLevelChange: (value: AiAccessLevel) => void;
  onJoinClick: () => void;
  onOpenChange: (open: boolean) => void;
  onRoleChange: (value: VaultRole) => void;
  onSubmit: (role: VaultRole, aiAccessLevel: AiAccessLevel) => void;
}) {
  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden">
      <Flex
        align="center"
        justify="space-between"
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.surface"
        px={{ base: '4', lg: '6' }}
        py="4"
      >
        <Box minW="0">
          <Text fontSize="xl" fontWeight="semibold" color="fg" truncate>
            {vault.name}
          </Text>
          <Text mt="1" fontSize="sm" color="fg.muted">
            Participation status: No participation
          </Text>
        </Box>
        <Button type="button" onClick={onJoinClick}>
          Join
        </Button>
      </Flex>

      <Flex flex="1" minH="0" align="center" justify="center" px="6">
        <Stack maxW="32rem" gap="4" textAlign="center" align="center">
          <Folder size={32} style={{ alignSelf: 'center' }} />
          <Text fontSize="2xl" fontWeight="bold" lineHeight="1.25" color="fg">
            Become a vault member to access documents
          </Text>
          <Text fontSize="sm" lineHeight="1.55" color="fg.muted">
            Admin accounts can see that this vault exists and inspect basic metadata, but document
            access requires visible vault membership.
          </Text>
          <Text fontSize="sm" lineHeight="1.55" color="fg.muted">
            {vault.description ?? 'No description set.'}
          </Text>
          <HStack justify="center">
            <Button type="button" onClick={onJoinClick}>
              Join
            </Button>
          </HStack>
        </Stack>
      </Flex>

      <AdminJoinVaultDialog
        open={open}
        canDismiss={canDismiss}
        role={role}
        aiAccessLevel={aiAccessLevel}
        isPending={isPending}
        onAiAccessLevelChange={onAiAccessLevelChange}
        onOpenChange={onOpenChange}
        onRoleChange={onRoleChange}
        onSubmit={onSubmit}
      />
    </Flex>
  );
}

export function DocumentsBrowserContent({
  activeIsError,
  activeIsLoading,
  allItemsSelected,
  backgroundContextItem,
  browserItems,
  browserView,
  contextItemKey,
  currentFolderId,
  draggedItemKeys,
  dropTarget,
  emptyState,
  itemMutationPending,
  selectedItemKeys,
  someItemsSelected,
  vaultId,
  getItemActions,
  onCreateFolder,
  onDragEndItem,
  onDragLeaveFolder,
  onDragOverFolder,
  onDragStartItem,
  onDropOnFolder,
  onOpenContextMenu,
  onOpenItem,
  onSelectItem,
  onToggleAllItems,
  onToggleItem,
}: {
  activeIsError: boolean;
  activeIsLoading: boolean;
  allItemsSelected: boolean;
  backgroundContextItem: BrowserContextItem;
  browserItems: BrowserItem[];
  browserView: FileBrowserView;
  contextItemKey: string | null;
  currentFolderId: string | null;
  draggedItemKeys: Set<string>;
  dropTarget: BrowserDropTarget | null;
  emptyState: boolean;
  itemMutationPending: boolean;
  selectedItemKeys: Set<string>;
  someItemsSelected: boolean;
  vaultId: string;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  onCreateFolder: (folderId: string | null) => void;
  onDragEndItem: () => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragStartItem: (event: DragEvent<HTMLElement>, item: BrowserItem) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserContextItem) => void;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    item: BrowserItem,
  ) => void;
  onToggleAllItems: (checked: boolean) => void;
  onToggleItem: (item: BrowserItem, checked: boolean) => void;
}) {
  return (
    <Flex flex="1" minH="0" overflow="hidden">
      <BrowserCurrentFolderDropZone
        folderId={currentFolderId}
        dropTarget={dropTarget}
        onDragOverFolder={onDragOverFolder}
        onDragLeaveFolder={onDragLeaveFolder}
        onDropOnFolder={onDropOnFolder}
      >
        {activeIsLoading ? (
          <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="4">
            <Text fontSize="sm" color="fg.muted">
              Loading folder...
            </Text>
          </Box>
        ) : null}
        {activeIsError ? (
          <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="4">
            <Text fontSize="sm" color="fg.error">
              Unable to load this folder.
            </Text>
          </Box>
        ) : null}

        {!activeIsLoading && emptyState ? (
          <CenteredEmptyState
            title={currentFolderId === null ? 'This vault is empty' : 'This folder is empty'}
            description="Create a folder or upload documents here."
            icon={<Folder size={28} />}
            action={
              <HStack gap="2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onCreateFolder(currentFolderId)}
                >
                  <FolderPlus size={16} />
                  New folder
                </Button>
              </HStack>
            }
            containerProps={{
              flex: '1',
              minH: '0',
              onContextMenu: (event) => onOpenContextMenu(event, backgroundContextItem),
            }}
          />
        ) : null}

        {!activeIsLoading && !activeIsError && !emptyState ? (
          browserView === 'list' ? (
            <BrowserItemList
              items={browserItems}
              vaultId={vaultId}
              selectedItemKeys={selectedItemKeys}
              selectable
              allItemsSelected={allItemsSelected}
              someItemsSelected={someItemsSelected}
              contextItemKey={contextItemKey}
              draggedItemKeys={draggedItemKeys}
              dropTarget={dropTarget}
              onOpenItem={onOpenItem}
              onSelectItem={onSelectItem}
              onToggleAllItems={onToggleAllItems}
              onToggleItem={onToggleItem}
              getItemActions={getItemActions}
              onDragStartItem={onDragStartItem}
              onDragEndItem={onDragEndItem}
              onDragOverFolder={onDragOverFolder}
              onDragLeaveFolder={onDragLeaveFolder}
              onDropOnFolder={onDropOnFolder}
              onOpenContextMenu={onOpenContextMenu}
              onOpenBackgroundContextMenu={(event) =>
                onOpenContextMenu(event, backgroundContextItem)
              }
              hideActionsUntilHover
              isMutating={itemMutationPending}
            />
          ) : (
            <BrowserItemGrid
              items={browserItems}
              vaultId={vaultId}
              selectedItemKeys={selectedItemKeys}
              selectable
              contextItemKey={contextItemKey}
              draggedItemKeys={draggedItemKeys}
              dropTarget={dropTarget}
              onOpenItem={onOpenItem}
              onSelectItem={onSelectItem}
              onToggleItem={onToggleItem}
              getItemActions={getItemActions}
              onDragStartItem={onDragStartItem}
              onDragEndItem={onDragEndItem}
              onDragOverFolder={onDragOverFolder}
              onDragLeaveFolder={onDragLeaveFolder}
              onDropOnFolder={onDropOnFolder}
              onOpenContextMenu={onOpenContextMenu}
              onOpenBackgroundContextMenu={(event) =>
                onOpenContextMenu(event, backgroundContextItem)
              }
              isMutating={itemMutationPending}
            />
          )
        ) : null}
      </BrowserCurrentFolderDropZone>
    </Flex>
  );
}

import type { FormEvent } from 'react';
import { ActionBar, Portal } from '@chakra-ui/react';
import { MoveRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentVersionsDialog } from '@/features/documents/components/detail/document-versions-dialog';
import type { DocumentVersionSummary } from '@/features/documents/documents.types';
import {
  BrowserContextMenu,
  ItemInfoDialog,
  MoveItemDialog,
  RenameItemDialog,
} from '@/features/file-browser/components/vault-browser-components';
import type {
  BrowserContextMenuEntry,
  BrowserItem,
  ContextMenuState,
  InfoDialogTarget,
  ItemDialogTarget,
  MoveDestination,
} from '@/features/file-browser/components/vault-browser.types';
import { DeleteItemsConfirmDialog } from './documents-page-browser-helpers';
import { CreateFolderDialog } from './documents-page-dialogs';

export function DocumentsPageOverlays({
  canDeleteItems,
  canDismissCreateFolderDialog,
  canUpdateItems,
  contextMenu,
  createFolderIsPending,
  deleteItemsIsPending,
  deleteVersionIsPending,
  documentId,
  folderName,
  folderPath,
  folderTreeIsLoading,
  infoTarget,
  isCreateFolderOpen,
  itemMutationPending,
  moveDestinationId,
  moveDestinations,
  moveIsPending,
  moveTargets,
  pendingTrashItems,
  renameIsPending,
  renameTarget,
  renameValue,
  restoreVersionIsPending,
  selectedCount,
  selectedItems,
  selectedVersionId,
  vaultId,
  versions,
  versionsIsError,
  versionsIsLoading,
  versionsTarget,
  getContextMenuEntries,
  onCloseContextMenu,
  onCloseInfo,
  onConfirmPendingDelete,
  onCreateFolderOpenChange,
  onCreateFolderSubmit,
  onDeleteVersion,
  onFolderNameChange,
  onMoveClose,
  onMoveDestinationChange,
  onMoveSubmit,
  onOpenDeleteConfirm,
  onOpenSelectedItemsMoveDialog,
  onPendingTrashItemsChange,
  onRenameClose,
  onRenameSubmit,
  onRenameValueChange,
  onRestoreVersion,
  onSelectedVersionChange,
  onVersionsOpenChange,
}: {
  canDeleteItems: boolean;
  canDismissCreateFolderDialog: boolean;
  canUpdateItems: boolean;
  contextMenu: ContextMenuState;
  createFolderIsPending: boolean;
  deleteItemsIsPending: boolean;
  deleteVersionIsPending: boolean;
  documentId: string;
  folderName: string;
  folderPath: string;
  folderTreeIsLoading: boolean;
  infoTarget: InfoDialogTarget;
  isCreateFolderOpen: boolean;
  itemMutationPending: boolean;
  moveDestinationId: string | null;
  moveDestinations: MoveDestination[];
  moveIsPending: boolean;
  moveTargets: BrowserItem[];
  pendingTrashItems: BrowserItem[];
  renameIsPending: boolean;
  renameTarget: ItemDialogTarget;
  renameValue: string;
  restoreVersionIsPending: boolean;
  selectedCount: number;
  selectedItems: BrowserItem[];
  selectedVersionId: string | null;
  vaultId: string;
  versions: DocumentVersionSummary[];
  versionsIsError: boolean;
  versionsIsLoading: boolean;
  versionsTarget: Extract<BrowserItem, { type: 'document' }> | null;
  getContextMenuEntries: (item: NonNullable<ContextMenuState>['item']) => BrowserContextMenuEntry[];
  onCloseContextMenu: () => void;
  onCloseInfo: () => void;
  onConfirmPendingDelete: () => void;
  onCreateFolderOpenChange: (open: boolean) => void;
  onCreateFolderSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteVersion: (version: DocumentVersionSummary) => Promise<void>;
  onFolderNameChange: (value: string) => void;
  onMoveClose: () => void;
  onMoveDestinationChange: (value: string | null) => void;
  onMoveSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenDeleteConfirm: (items: BrowserItem[]) => void;
  onOpenSelectedItemsMoveDialog: () => void;
  onPendingTrashItemsChange: (items: BrowserItem[]) => void;
  onRenameClose: () => void;
  onRenameSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRenameValueChange: (value: string) => void;
  onRestoreVersion: (version: DocumentVersionSummary) => Promise<void>;
  onSelectedVersionChange: (versionId: string | null) => void;
  onVersionsOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <ActionBar.Root open={selectedCount > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>{selectedCount} selected</ActionBar.SelectionTrigger>
              <ActionBar.Separator />
              <Button
                size="sm"
                variant="outline"
                disabled={!canUpdateItems || itemMutationPending}
                onClick={onOpenSelectedItemsMoveDialog}
              >
                <MoveRight size={16} />
                Move to
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="red"
                disabled={!canDeleteItems || itemMutationPending}
                onClick={() => onOpenDeleteConfirm(selectedItems)}
              >
                <Trash2 size={16} />
                Delete
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>

      <CreateFolderDialog
        open={isCreateFolderOpen}
        canDismiss={canDismissCreateFolderDialog}
        folderName={folderName}
        isPending={createFolderIsPending}
        onFolderNameChange={onFolderNameChange}
        onOpenChange={onCreateFolderOpenChange}
        onSubmit={onCreateFolderSubmit}
      />

      <RenameItemDialog
        open={renameTarget !== null}
        target={renameTarget}
        value={renameValue}
        isPending={renameIsPending}
        onValueChange={onRenameValueChange}
        onClose={onRenameClose}
        onSubmit={onRenameSubmit}
      />

      <MoveItemDialog
        open={moveTargets.length > 0}
        target={moveTargets}
        value={moveDestinationId}
        destinations={moveDestinations}
        isPending={moveIsPending}
        isLoading={folderTreeIsLoading}
        onValueChange={onMoveDestinationChange}
        onClose={onMoveClose}
        onSubmit={onMoveSubmit}
      />

      <ItemInfoDialog
        open={infoTarget !== null}
        target={infoTarget}
        folderPath={folderPath}
        onClose={onCloseInfo}
      />

      <DocumentVersionsDialog
        open={versionsTarget !== null}
        onOpenChange={onVersionsOpenChange}
        vaultId={vaultId}
        documentId={documentId}
        versions={versions}
        isLoading={versionsIsLoading}
        isError={versionsIsError}
        selectedVersionId={selectedVersionId}
        isRestorePending={restoreVersionIsPending}
        isDeletePending={deleteVersionIsPending}
        onSelectVersion={onSelectedVersionChange}
        onRestoreVersion={onRestoreVersion}
        onDeleteVersion={onDeleteVersion}
      />

      <DeleteItemsConfirmDialog
        items={pendingTrashItems}
        isPending={deleteItemsIsPending}
        onClose={() => onPendingTrashItemsChange([])}
        onConfirm={onConfirmPendingDelete}
      />

      {contextMenu !== null ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getContextMenuEntries(contextMenu.item)}
          onClose={onCloseContextMenu}
        />
      ) : null}
    </>
  );
}

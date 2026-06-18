import type { FormEvent } from 'react';
import { CloseButton, Dialog as ChakraDialog, Portal, Text } from '@chakra-ui/react';
import { DeleteButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { DocumentVersionsDialog } from '@/features/documents/components/detail/document-versions-dialog';
import type { DocumentDuplicateConflict } from '@/features/documents/documents.api';
import type { DocumentVersionSummary } from '@/features/documents/documents.types';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { conflictStrategyLabel } from './document-detail-page.helpers';

export function DocumentDetailDialogs({
  documentName,
  isDeleteDialogOpen,
  isDeletePending,
  restoreConflict,
  isRestorePending,
  isVersionsDialogOpen,
  vaultId,
  documentId,
  versions,
  isVersionsLoading,
  isVersionsError,
  selectedVersionId,
  isRestoreVersionPending,
  isDeleteVersionPending,
  isCreateTagDialogOpen,
  isCreateTagPending,
  isCreateTagDialogDirty,
  isCreateTagSaveDisabled,
  createTagNameValue,
  createTagColorValue,
  createTagDescriptionValue,
  onCreateTagColorChange,
  onCreateTagDescriptionChange,
  onCreateTagNameChange,
  onCreateTagSubmit,
  onDelete,
  onDeleteDialogOpenChange,
  onDeleteVersion,
  onRestoreConflictOpenChange,
  onRestoreConflictStrategy,
  onRestoreVersion,
  onSelectVersion,
  onVersionsDialogOpenChange,
  onCloseCreateTagDialog,
}: {
  documentName: string;
  isDeleteDialogOpen: boolean;
  isDeletePending: boolean;
  restoreConflict: DocumentDuplicateConflict | null;
  isRestorePending: boolean;
  isVersionsDialogOpen: boolean;
  vaultId: string;
  documentId: string;
  versions: DocumentVersionSummary[];
  isVersionsLoading: boolean;
  isVersionsError: boolean;
  selectedVersionId: string | null;
  isRestoreVersionPending: boolean;
  isDeleteVersionPending: boolean;
  isCreateTagDialogOpen: boolean;
  isCreateTagPending: boolean;
  isCreateTagDialogDirty: boolean;
  isCreateTagSaveDisabled: boolean;
  createTagNameValue: string;
  createTagColorValue: string;
  createTagDescriptionValue: string;
  onCreateTagColorChange: (value: string) => void;
  onCreateTagDescriptionChange: (value: string) => void;
  onCreateTagNameChange: (value: string) => void;
  onCreateTagSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onDeleteVersion: (version: DocumentVersionSummary) => Promise<void>;
  onRestoreConflictOpenChange: (open: boolean) => void;
  onRestoreConflictStrategy: (strategy: DocumentDuplicateConflict['availableStrategies'][number]) => void;
  onRestoreVersion: (version: DocumentVersionSummary) => Promise<void>;
  onSelectVersion: (versionId: string | null) => void;
  onVersionsDialogOpenChange: (open: boolean) => void;
  onCloseCreateTagDialog: () => void;
}) {
  return (
    <>
      <DeleteDocumentDialog
        documentName={documentName}
        open={isDeleteDialogOpen}
        isPending={isDeletePending}
        onDelete={onDelete}
        onOpenChange={onDeleteDialogOpenChange}
      />
      <RestoreConflictDialog
        conflict={restoreConflict}
        isPending={isRestorePending}
        onOpenChange={onRestoreConflictOpenChange}
        onRestore={onRestoreConflictStrategy}
      />
      <DocumentVersionsDialog
        open={isVersionsDialogOpen}
        onOpenChange={onVersionsDialogOpenChange}
        vaultId={vaultId}
        documentId={documentId}
        versions={versions}
        isLoading={isVersionsLoading}
        isError={isVersionsError}
        selectedVersionId={selectedVersionId}
        isRestorePending={isRestoreVersionPending}
        isDeletePending={isDeleteVersionPending}
        onSelectVersion={onSelectVersion}
        onRestoreVersion={onRestoreVersion}
        onDeleteVersion={onDeleteVersion}
      />
      <TagDialog
        isOpen={isCreateTagDialogOpen}
        title="New tag"
        submitLabel="Create"
        pendingLabel="Creating..."
        closeLabel="Close create tag dialog"
        isPending={isCreateTagPending}
        isDirty={isCreateTagDialogDirty}
        isSubmitDisabled={isCreateTagSaveDisabled}
        nameValue={createTagNameValue}
        colorValue={createTagColorValue}
        descriptionValue={createTagDescriptionValue}
        onNameChange={onCreateTagNameChange}
        onColorChange={onCreateTagColorChange}
        onDescriptionChange={onCreateTagDescriptionChange}
        onClose={onCloseCreateTagDialog}
        onSubmit={onCreateTagSubmit}
      />
    </>
  );
}

function DeleteDocumentDialog({
  documentName,
  open,
  isPending,
  onDelete,
  onOpenChange,
}: {
  documentName: string;
  open: boolean;
  isPending: boolean;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!isPending) {
          onOpenChange(event.open);
        }
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Move "${documentName}" to trash?`}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Text color="fg.muted" fontSize="sm">
                This document will be removed from the active vault, but it is recoverable from
                Trash until it is permanently removed manually or automatically after 30 days.
              </Text>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <DeleteButton type="button" disabled={isPending} onClick={onDelete}>
                {isPending ? 'Moving...' : 'Trash'}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

function RestoreConflictDialog({
  conflict,
  isPending,
  onOpenChange,
  onRestore,
}: {
  conflict: DocumentDuplicateConflict | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (strategy: DocumentDuplicateConflict['availableStrategies'][number]) => void;
}) {
  return (
    <ChakraDialog.Root
      open={conflict !== null}
      onOpenChange={(event) => {
        if (!event.open && !isPending) {
          onOpenChange(false);
        }
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>Document already exists</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" disabled={isPending} />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Text color="fg.muted" fontSize="sm">
                {conflict?.message ?? 'A document with this file already exists in this vault.'}
              </Text>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              {conflict?.availableStrategies.map((strategy) => (
                <Button
                  key={strategy}
                  type="button"
                  variant={strategy === 'keep_both' ? 'default' : 'outline'}
                  disabled={isPending}
                  onClick={() => onRestore(strategy)}
                >
                  {conflictStrategyLabel(strategy)}
                </Button>
              ))}
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

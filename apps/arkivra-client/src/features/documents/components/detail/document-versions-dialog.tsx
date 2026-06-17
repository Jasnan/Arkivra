import { Box, Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import { AlertCircle, CheckCircle2, Download, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DeleteButton } from '@/components/ui/action-buttons';
import type {
  DeletionImpactPreview,
  DocumentVersionSummary,
} from '@/features/documents/documents.types';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import {
  getDocumentVersionDeletionImpact,
  getDocumentVersionDownloadUrl,
} from '@/features/documents/documents.api';
import { useState } from 'react';

function versionStatusLabel(version: DocumentVersionSummary) {
  if (version.deletedAt !== null) {
    return 'Deleted';
  }

  return version.processingStatus ?? 'pending';
}

function isRestorable(version: DocumentVersionSummary) {
  return (
    !version.isCurrent && version.deletedAt === null && version.processingStatus === 'completed'
  );
}

function isDeletable(version: DocumentVersionSummary) {
  return !version.isCurrent && version.deletedAt === null;
}

function AffectedConversationsList({ impact }: { impact: DeletionImpactPreview }) {
  const shownCount = impact.affectedConversations.length;
  const hasMore = impact.affectedConversationCount > shownCount;

  return (
    <Stack gap="3" color="fg.muted" fontSize="sm" lineHeight="1.55">
      <Text>
        This version is referenced by {impact.affectedConversationCount}{' '}
        {impact.affectedConversationCount === 1 ? 'conversation' : 'conversations'}.
      </Text>
      <Text>Deleting it will:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        <Text as="li">preserve conversation history</Text>
        <Text as="li">remove source content</Text>
        <Text as="li">make the affected conversations read-only</Text>
      </Stack>
      <Text>Affected conversations{hasMore ? ` (${impact.affectedConversationCount})` : ''}:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        {impact.affectedConversations.map((conversation) => (
          <Text as="li" key={conversation.id} overflowWrap="anywhere">
            {conversation.title}
          </Text>
        ))}
      </Stack>
      {hasMore ? (
        <Text>
          Showing {shownCount} of {impact.affectedConversationCount} conversations.
        </Text>
      ) : null}
    </Stack>
  );
}

export function DocumentVersionsDialog({
  open,
  onOpenChange,
  vaultId,
  documentId,
  versions,
  isLoading,
  isError,
  selectedVersionId,
  isRestorePending,
  isDeletePending,
  onSelectVersion,
  onRestoreVersion,
  onDeleteVersion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultId: string;
  documentId: string;
  versions: DocumentVersionSummary[];
  isLoading: boolean;
  isError: boolean;
  selectedVersionId: string | null;
  isRestorePending: boolean;
  isDeletePending: boolean;
  onSelectVersion: (versionId: string | null) => void;
  onRestoreVersion: (version: DocumentVersionSummary) => Promise<void>;
  onDeleteVersion: (version: DocumentVersionSummary) => Promise<void>;
}) {
  const [versionPendingRestore, setVersionPendingRestore] = useState<DocumentVersionSummary | null>(
    null,
  );
  const [versionPendingDelete, setVersionPendingDelete] = useState<DocumentVersionSummary | null>(
    null,
  );
  const [deleteImpact, setDeleteImpact] = useState<DeletionImpactPreview | null>(null);
  const [isDeleteImpactLoading, setIsDeleteImpactLoading] = useState(false);
  const [deleteImpactError, setDeleteImpactError] = useState<string | null>(null);
  const isMutating = isRestorePending || isDeletePending;

  function closeDeleteDialog() {
    setVersionPendingDelete(null);
    setDeleteImpact(null);
    setDeleteImpactError(null);
    setIsDeleteImpactLoading(false);
  }

  function openDeleteDialog(version: DocumentVersionSummary) {
    setVersionPendingDelete(version);
    setDeleteImpact(null);
    setDeleteImpactError(null);
    setIsDeleteImpactLoading(true);
    void getDocumentVersionDeletionImpact({
      vaultId,
      documentId,
      versionId: version.id,
      limit: 5,
    })
      .then(({ impact }) => {
        setDeleteImpact(impact);
      })
      .catch((error) => {
        setDeleteImpactError(
          error instanceof Error ? error.message : 'Could not check affected conversations.',
        );
      })
      .finally(() => {
        setIsDeleteImpactLoading(false);
      });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} closeOnEscape={!isMutating}>
        <DialogContent maxW="4xl">
          <DialogHeader pr="10">
            <DialogTitle>Versions</DialogTitle>
            <DialogDescription>
              Review uploaded versions, open a historical read-only view, or restore a completed
              historical version as the latest version.
            </DialogDescription>
          </DialogHeader>
          <DialogBody px={{ base: '4', md: '6' }} pb="6">
            {isLoading ? (
              <Flex minH="14rem" align="center" justify="center" gap="3" color="fg.muted">
                <Spinner size="sm" color="teal.solid" />
                <Text fontSize="sm">Loading versions...</Text>
              </Flex>
            ) : isError ? (
              <Flex minH="14rem" align="center" justify="center" gap="3" color="fg.error">
                <AlertCircle size={18} />
                <Text fontSize="sm" fontWeight="semibold">
                  Unable to load versions.
                </Text>
              </Flex>
            ) : (
              <Stack gap="2">
                {versions.map((version) => {
                  const isSelected =
                    selectedVersionId === version.id ||
                    (selectedVersionId === null && version.isCurrent);

                  return (
                    <Box
                      key={version.id}
                      rounded="lg"
                      borderWidth="1px"
                      borderColor={isSelected ? 'teal.muted' : 'border.surface'}
                      bg={isSelected ? 'teal.subtle' : 'bg.surface'}
                      px={{ base: '3', md: '4' }}
                      py="3"
                    >
                      <Flex
                        direction={{ base: 'column', lg: 'row' }}
                        align={{ lg: 'center' }}
                        justify="space-between"
                        gap="3"
                      >
                        <Box minW="0" flex="1">
                          <HStack gap="2" flexWrap="wrap">
                            <Text fontWeight="semibold" color="fg">
                              v{version.versionNumber}
                            </Text>
                            {version.isCurrent ? (
                              <Badge variant="secondary" colorPalette="teal">
                                Current
                              </Badge>
                            ) : (
                              <Badge variant="outline">Historical</Badge>
                            )}
                            {version.restoredFromVersionId ? (
                              <Badge variant="outline" colorPalette="purple">
                                Restored
                              </Badge>
                            ) : null}
                            {isSelected ? (
                              <Badge variant="secondary" colorPalette="green">
                                <CheckCircle2 size={12} />
                                Selected
                              </Badge>
                            ) : null}
                          </HStack>
                          <Text mt="1" truncate fontSize="sm" color="fg">
                            {version.originalName}
                          </Text>
                          <Text mt="1" fontSize="xs" color="fg.muted">
                            Uploaded {formatDate(version.uploadedAt)} ·{' '}
                            {formatBytes(version.originalSize)} · {versionStatusLabel(version)}
                          </Text>
                          <Text mt="1" fontSize="xs" color="fg.muted" truncate>
                            SHA-256 {version.originalSha256Hash}
                          </Text>
                        </Box>
                        <Flex
                          flexWrap="wrap"
                          gap="2"
                          justify={{ base: 'flex-start', lg: 'flex-end' }}
                        >
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? 'secondary' : 'outline'}
                            onClick={() => {
                              onSelectVersion(version.isCurrent ? null : version.id);
                            }}
                          >
                            View
                          </Button>
                          <a
                            href={getDocumentVersionDownloadUrl({
                              vaultId,
                              documentId,
                              versionId: version.id,
                            })}
                          >
                            <Button as="span" size="sm" variant="outline">
                              <Download size={15} />
                              Download
                            </Button>
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!isRestorable(version) || isMutating}
                            onClick={() => setVersionPendingRestore(version)}
                          >
                            <RotateCcw size={15} />
                            Restore
                          </Button>
                          <DeleteButton
                            type="button"
                            size="sm"
                            disabled={!isDeletable(version) || isMutating}
                            onClick={() => openDeleteDialog(version)}
                          >
                            Delete
                          </DeleteButton>
                        </Flex>
                      </Flex>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog
        open={versionPendingRestore !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isRestorePending) {
            setVersionPendingRestore(null);
          }
        }}
        closeOnEscape={!isRestorePending}
      >
        <DialogContent maxW="lg">
          <DialogHeader pr="10">
            <DialogTitle>
              {versionPendingRestore
                ? `Restore v${versionPendingRestore.versionNumber}?`
                : 'Restore version?'}
            </DialogTitle>
            <DialogDescription>
              Restoring creates a new latest version. The historical version remains in the version
              list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isRestorePending}
              onClick={() => setVersionPendingRestore(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={versionPendingRestore === null || isRestorePending}
              onClick={() => {
                if (versionPendingRestore === null) return;
                void onRestoreVersion(versionPendingRestore).then(() =>
                  setVersionPendingRestore(null),
                );
              }}
            >
              {isRestorePending ? 'Restoring...' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={versionPendingDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeletePending) {
            closeDeleteDialog();
          }
        }}
        closeOnEscape={!isDeletePending && !isDeleteImpactLoading}
      >
        <DialogContent maxW="lg">
          <DialogHeader pr="10">
            <DialogTitle>
              {versionPendingDelete
                ? `Delete v${versionPendingDelete.versionNumber}?`
                : 'Delete version?'}
            </DialogTitle>
          </DialogHeader>
          <DialogBody px={{ base: '4', md: '6' }}>
            {isDeleteImpactLoading ? (
              <Flex align="center" gap="3" color="fg.muted">
                <Spinner size="sm" color="teal.solid" />
                <Text fontSize="sm">Checking affected conversations...</Text>
              </Flex>
            ) : deleteImpactError !== null ? (
              <Flex align="center" gap="3" color="fg.error">
                <AlertCircle size={18} />
                <Text fontSize="sm" fontWeight="semibold">
                  {deleteImpactError}
                </Text>
              </Flex>
            ) : deleteImpact !== null && deleteImpact.affectedConversationCount > 0 ? (
              <AffectedConversationsList impact={deleteImpact} />
            ) : (
              <DialogDescription>
                This removes this older version from the version history. The current file stays
                unchanged.
              </DialogDescription>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeletePending || isDeleteImpactLoading}
              onClick={closeDeleteDialog}
            >
              Cancel
            </Button>
            <DeleteButton
              type="button"
              disabled={
                versionPendingDelete === null ||
                isDeletePending ||
                isDeleteImpactLoading ||
                deleteImpactError !== null
              }
              onClick={() => {
                if (versionPendingDelete === null) return;
                void onDeleteVersion(versionPendingDelete).then(closeDeleteDialog);
              }}
            >
              {isDeletePending ? 'Deleting...' : 'Delete version'}
            </DeleteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

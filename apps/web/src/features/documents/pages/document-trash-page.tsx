import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { EmptyState, PageIntro, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DeleteButton, RestoreButton } from '@/components/ui/action-buttons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { permanentlyDeleteDocument, restoreDocument } from '@/features/documents/documents.api';
import {
  documentQueryKeys,
  useDeletedDocumentsQuery,
} from '@/features/documents/documents.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { DeletedDocumentSummary, DocumentSummary } from '@/features/documents/documents.types';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

function getPermanentDeletionLabel(deletedAt: string | null, retentionDays: number) {
  if (!deletedAt) {
    return 'Pending retention window';
  }

  const deleteAt = new Date(deletedAt);
  deleteAt.setDate(deleteAt.getDate() + retentionDays);

  return formatDate(deleteAt.toISOString());
}

function getResolvedVaultId(
  document: DocumentSummary | DeletedDocumentSummary,
  fallbackVaultId?: string,
) {
  return 'vaultId' in document ? document.vaultId : (fallbackVaultId ?? '');
}

function getResolvedVaultName(document: DocumentSummary | DeletedDocumentSummary) {
  return 'vaultName' in document ? document.vaultName : null;
}

export function DocumentTrashPage() {
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const vaultId = search.vaultId?.trim() || undefined;
  const queryClient = useQueryClient();
  const vaultsQuery = useVaultsQuery();
  const deletedDocumentsQuery = useDeletedDocumentsQuery({ vaultId });

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      toast.success('Document restored.');
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore document.');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: permanentlyDeleteDocument,
    onSuccess: async () => {
      toast.success('Document permanently deleted.');
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not permanently delete document.',
      );
    },
  });

  const deletedDocuments = deletedDocumentsQuery.data?.documents ?? [];
  const retentionDays = deletedDocumentsQuery.data?.retentionDays ?? 30;
  const isLoading = deletedDocumentsQuery.isLoading;
  const isError = deletedDocumentsQuery.isError;
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        deletedDocuments.map((document) =>
          permanentlyDeleteDocument({
            vaultId: getResolvedVaultId(document, vaultId),
            documentId: document.id,
          }),
        ),
      );
    },
    onSuccess: async () => {
      toast.success('All trashed documents permanently deleted.');
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not permanently delete all documents.',
      );
    },
  });
  const vaults = vaultsQuery.data?.vaults ?? [];

  function updateVaultFilter(nextVaultId: string) {
    navigate({
      to: ROUTES.trash,
      search: nextVaultId.length > 0 ? { vaultId: nextVaultId } : {},
      replace: true,
    } as any);
  }

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Lifecycle Control"
        title="Trash"
        description="Restore or permanently delete soft-deleted documents."
      />
      <Alert>
        <AlertDescription>
          Trashed documents stay here for {retentionDays} days before Arkivra removes them
          automatically.
        </AlertDescription>
      </Alert>

      <SurfacePanel display="flex" flexDirection="column" gap="5">
        <Flex justify="space-between" align={{ base: 'stretch', sm: 'center' }} direction={{ base: 'column', sm: 'row' }} gap="3">
          <Text fontSize="sm" fontWeight="medium" color="fg">
            Vault
          </Text>
          <Box w={{ base: 'full', sm: '16rem' }}>
            <Select
              value={vaultId ?? '__all__'}
              onValueChange={(value) => updateVaultFilter(value === '__all__' ? '' : value)}
            >
              <SelectTrigger className={vaultInputClassName} h="10" rounded="lg" fontSize="sm">
                <SelectValue placeholder="All vaults" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All vaults</SelectItem>
                {vaults.map((vault) => (
                  <SelectItem key={vault.id} value={vault.id}>
                    {vault.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        </Flex>
        {isLoading ? (
          <Text textStyle="sm">Loading deleted documents...</Text>
        ) : null}
        {isError ? <Text textStyle="sm" color="fg.error">Unable to load trash.</Text> : null}

        {!isLoading && deletedDocuments.length === 0 ? (
          <EmptyState description="Trash is empty." />
        ) : (
          <Stack gap="4">
            <Flex justify="flex-end">
              <DeleteButton
                type="button"
                disabled={
                  deleteAllMutation.isPending ||
                  permanentDeleteMutation.isPending ||
                  restoreMutation.isPending
                }
                onClick={() => {
                  deleteAllMutation.mutate();
                }}
              >
                {deleteAllMutation.isPending ? 'Deleting...' : 'Delete all permanently'}
              </DeleteButton>
            </Flex>
            {deletedDocuments.map((document) => (
              <Box
                key={document.id}
                as="article"
                borderColor="border.subtle"
                p={{ base: '4', sm: '5' }}
                _hover={{ bg: 'teal.subtle' }}
              >
                <Flex direction={{ base: 'column', lg: 'row' }} align={{ lg: 'flex-start' }} justify={{ lg: 'space-between' }} gap="4">
                  <Box>
                    <Link
                      to={ROUTES.vaultDocument(getResolvedVaultId(document, vaultId), document.id)}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <Text
                        fontSize={{ base: 'xl', sm: 'sm' }}
                        fontWeight="bold"
                        color="fg"
                        transition="colors"
                        _hover={{ color: 'teal.solid' }}
                      >
                        {document.name}
                      </Text>
                    </Link>
                    <Text mt="2" textStyle="sm">
                      Deleted {formatDate(document.deletedAt)} •{' '}
                      {formatBytes(document.originalSize)}
                    </Text>
                    {getResolvedVaultName(document) ? (
                      <Text textStyle="sm">
                        Vault {getResolvedVaultName(document)} • auto-delete{' '}
                        {getPermanentDeletionLabel(document.deletedAt, retentionDays)}
                      </Text>
                    ) : (
                      <Text textStyle="sm">
                        Auto-delete {getPermanentDeletionLabel(document.deletedAt, retentionDays)}
                      </Text>
                    )}
                  </Box>

                  <Flex flexWrap="wrap" gap="3">
                    <RestoreButton
                      type="button"
                      disabled={
                        restoreMutation.isPending ||
                        permanentDeleteMutation.isPending ||
                        deleteAllMutation.isPending
                      }
                      onClick={() => {
                        restoreMutation.mutate({
                          vaultId: getResolvedVaultId(document, vaultId),
                          documentId: document.id,
                        });
                      }}
                    >
                      Restore
                    </RestoreButton>
                    <DeleteButton
                      type="button"
                      disabled={
                        permanentDeleteMutation.isPending ||
                        restoreMutation.isPending ||
                        deleteAllMutation.isPending
                      }
                      onClick={() => {
                        permanentDeleteMutation.mutate({
                          vaultId: getResolvedVaultId(document, vaultId),
                          documentId: document.id,
                        });
                      }}
                    >
                      Delete permanently
                    </DeleteButton>
                  </Flex>
                </Flex>
              </Box>
            ))}
          </Stack>
        )}
      </SurfacePanel>
    </Stack>
  );
}

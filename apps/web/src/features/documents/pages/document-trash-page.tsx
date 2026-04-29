import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageIntro, SurfacePanel } from '@/components/layout/vault-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DeleteButton, RestoreButton } from '@/components/ui/action-buttons';
import { permanentlyDeleteDocument, restoreDocument } from '@/features/documents/documents.api';
import {
  documentQueryKeys,
  useDeletedDocumentsQuery,
  useDocumentsQuery,
} from '@/features/documents/documents.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { DeletedDocumentSummary, DocumentSummary } from '@/features/documents/documents.types';

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
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId;
  const isVaultScoped = typeof vaultId === 'string' && vaultId.length > 0;
  const queryClient = useQueryClient();
  const vaultDocumentsQuery = useDocumentsQuery({
    vaultId: vaultId ?? '',
    includeDeleted: true,
    enabled: isVaultScoped,
  });
  const deletedDocumentsQuery = useDeletedDocumentsQuery({ enabled: !isVaultScoped });

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

  const deletedDocuments = isVaultScoped
    ? (vaultDocumentsQuery.data?.documents ?? []).filter((document) => document.isDeleted)
    : (deletedDocumentsQuery.data?.documents ?? []);
  const retentionDays = isVaultScoped
    ? (vaultDocumentsQuery.data?.retentionDays ?? 30)
    : (deletedDocumentsQuery.data?.retentionDays ?? 30);
  const isLoading = isVaultScoped ? vaultDocumentsQuery.isLoading : deletedDocumentsQuery.isLoading;
  const isError = isVaultScoped ? vaultDocumentsQuery.isError : deletedDocumentsQuery.isError;
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

  return (
    <section className="space-y-8 pb-8">
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

      <SurfacePanel className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading deleted documents...</p>
        ) : null}
        {isError ? <p className="text-sm text-destructive">Unable to load trash.</p> : null}

        {!isLoading && deletedDocuments.length === 0 ? (
          <div className="vault-empty">Trash is empty.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
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
            </div>
            {deletedDocuments.map((document) => (
              <article key={document.id} className="rounded-lg bg-secondary/56 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Link
                      to={`/vaults/${getResolvedVaultId(document, vaultId)}/documents/${document.id}`}
                      className="font-display text-xl font-bold  text-foreground transition hover:text-primary sm:text-sm"
                    >
                      {document.name}
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Deleted {formatDate(document.deletedAt)} •{' '}
                      {formatBytes(document.originalSize)}
                    </p>
                    {getResolvedVaultName(document) ? (
                      <p className="text-sm text-muted-foreground">
                        Vault {getResolvedVaultName(document)} • auto-delete{' '}
                        {getPermanentDeletionLabel(document.deletedAt, retentionDays)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Auto-delete {getPermanentDeletionLabel(document.deletedAt, retentionDays)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
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
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfacePanel>
    </section>
  );
}

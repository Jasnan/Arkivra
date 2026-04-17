import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageIntro, StatCard, StatusBanner, SurfacePanel } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { restoreDocument } from '@/features/documents/documents.api';
import { documentQueryKeys, useDeletedDocumentsQuery, useDocumentsQuery } from '@/features/documents/documents.queries';
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

function getResolvedVaultId(document: DocumentSummary | DeletedDocumentSummary, fallbackVaultId?: string) {
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      setStatusMessage('Document restored.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not restore document.');
      setStatusMessage(null);
    },
  });

  const deletedDocuments = isVaultScoped
    ? (vaultDocumentsQuery.data?.documents ?? []).filter(document => document.isDeleted)
    : (deletedDocumentsQuery.data?.documents ?? []);
  const retentionDays = isVaultScoped
    ? (vaultDocumentsQuery.data?.retentionDays ?? 30)
    : (deletedDocumentsQuery.data?.retentionDays ?? 30);
  const isLoading = isVaultScoped ? vaultDocumentsQuery.isLoading : deletedDocumentsQuery.isLoading;
  const isError = isVaultScoped ? vaultDocumentsQuery.isError : deletedDocumentsQuery.isError;
  const backTarget = isVaultScoped ? `/vaults/${vaultId}/documents` : '/documents';
  const backLabel = isVaultScoped ? 'Back to documents' : 'Back to library';

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Lifecycle Control"
        title="Trash"
        description={`Review soft-deleted documents and restore them before Arkivra permanently removes them after ${retentionDays} days.`}
        actions={<Link to={backTarget} className="vault-link">{backLabel}</Link>}
      />

      {(statusMessage || errorMessage) ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="Deleted records"
          value={deletedDocuments.length}
          meta="Documents currently waiting in the vault trash."
          icon={<Trash2 className="size-5" />}
        />
        <StatCard
          label="Recovery status"
          value={deletedDocuments.length > 0 ? 'Available' : 'Clear'}
          meta={deletedDocuments.length > 0 ? `Items stay recoverable for ${retentionDays} days before automatic removal.` : 'Nothing is waiting in trash right now.'}
          icon={<RotateCcw className="size-5" />}
        />
      </div>

      <SurfacePanel className="space-y-5">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading deleted documents...</p> : null}
        {isError ? <p className="text-sm text-destructive">Unable to load trash.</p> : null}

        {!isLoading && deletedDocuments.length === 0 ? (
          <div className="vault-empty">Trash is empty.</div>
        ) : (
          <div className="space-y-4">
            {deletedDocuments.map(document => (
              <article key={document.id} className="rounded-[24px] bg-secondary/56 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Link
                      to={`/vaults/${getResolvedVaultId(document, vaultId)}/documents/${document.id}`}
                      className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground transition hover:text-primary"
                    >
                      {document.name}
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Deleted {formatDate(document.deletedAt)} • {formatBytes(document.originalSize)}
                    </p>
                    {getResolvedVaultName(document) ? (
                      <p className="text-sm text-muted-foreground">
                        Vault {getResolvedVaultName(document)} • auto-delete {getPermanentDeletionLabel(document.deletedAt, retentionDays)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Auto-delete {getPermanentDeletionLabel(document.deletedAt, retentionDays)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={restoreMutation.isPending}
                      onClick={() => {
                        setStatusMessage(null);
                        setErrorMessage(null);
                        restoreMutation.mutate({ vaultId: getResolvedVaultId(document, vaultId), documentId: document.id });
                      }}
                    >
                      Restore
                    </Button>
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

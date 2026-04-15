import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageIntro, StatCard, StatusBanner, SurfacePanel } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  permanentlyDeleteDocument,
  restoreDocument,
} from '@/features/documents/documents.api';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';

export function DocumentTrashPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? '';
  const queryClient = useQueryClient();
  const documentsQuery = useDocumentsQuery({ vaultId, includeDeleted: true });
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

  const deleteMutation = useMutation({
    mutationFn: permanentlyDeleteDocument,
    onSuccess: async () => {
      setStatusMessage('Document permanently deleted.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not permanently delete document.');
      setStatusMessage(null);
    },
  });

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  const deletedDocuments = (documentsQuery.data?.documents ?? []).filter(document => document.isDeleted);

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Lifecycle Control"
        title="Trash"
        description="Review deleted documents, restore them back to the vault, or remove them permanently."
        actions={<Link to={`/vaults/${vaultId}/documents`} className="vault-link">Back to documents</Link>}
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
          meta={deletedDocuments.length > 0 ? 'Each item can be restored or removed forever.' : 'Nothing is waiting in trash right now.'}
          icon={<RotateCcw className="size-5" />}
        />
      </div>

      <SurfacePanel className="space-y-5">
        {documentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading deleted documents...</p> : null}
        {documentsQuery.isError ? <p className="text-sm text-destructive">Unable to load trash.</p> : null}

        {!documentsQuery.isLoading && deletedDocuments.length === 0 ? (
          <div className="vault-empty">Trash is empty.</div>
        ) : (
          <div className="space-y-4">
            {deletedDocuments.map(document => (
              <article key={document.id} className="rounded-[24px] bg-secondary/56 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Link to={`/vaults/${vaultId}/documents/${document.id}`} className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground transition hover:text-primary">
                      {document.name}
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Deleted {formatDate(document.deletedAt)} • {formatBytes(document.originalSize)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={restoreMutation.isPending}
                      onClick={() => {
                        setStatusMessage(null);
                        setErrorMessage(null);
                        restoreMutation.mutate({ vaultId, documentId: document.id });
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        setStatusMessage(null);
                        setErrorMessage(null);
                        deleteMutation.mutate({ vaultId, documentId: document.id });
                      }}
                    >
                      Delete forever
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

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
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
    <section className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Trash</h2>
          <p className="text-sm text-muted-foreground">Restore deleted documents or remove them permanently.</p>
        </div>
        <Link to={`/vaults/${vaultId}/documents`} className="text-sm font-medium text-primary hover:underline">Back to documents</Link>
      </div>

      {statusMessage ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">{statusMessage}</p> : null}
      {errorMessage ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="rounded-2xl border border-border bg-card p-6">
        {documentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading deleted documents…</p> : null}
        {documentsQuery.isError ? <p className="text-sm text-destructive">Unable to load trash.</p> : null}

        {!documentsQuery.isLoading && deletedDocuments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Trash is empty.</p>
        ) : (
          <ul className="space-y-3">
            {deletedDocuments.map(document => (
              <li key={document.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Link to={`/vaults/${vaultId}/documents/${document.id}`} className="font-medium text-primary hover:underline">
                      {document.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Deleted {formatDate(document.deletedAt)} • {formatBytes(document.originalSize)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

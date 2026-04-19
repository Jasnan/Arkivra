import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileUp,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatBytes } from '@/features/documents/documents.utils';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { cn } from '@/lib/utils';
import { uploadManager } from '../upload-manager';
import { useUploadManagerState } from '../use-upload-manager';

function statusLabel(status: string) {
  switch (status) {
    case 'queued': return 'Queued';
    case 'uploading': return 'Uploading';
    case 'paused': return 'Paused';
    case 'processing': return 'Processing';
    case 'completed': return 'Done';
    case 'failed': return 'Failed';
    case 'canceled': return 'Canceled';
    default: return status;
  }
}

export function TransfersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useVaultsQuery();
  const state = useUploadManagerState();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const vaultId = searchParams.get('vaultId') ?? data?.vaults[0]?.id ?? '';
  const isVaultLocked = searchParams.get('locked') === 'true' && vaultId.length > 0;
  const activeVaultName = (data?.vaults ?? []).find(vault => vault.id === vaultId)?.name ?? null;
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  const totalBytes = useMemo(
    () => state.items.reduce((sum, item) => sum + item.size, 0),
    [state.items],
  );
  const uploadedBytes = useMemo(
    () => state.items.reduce((sum, item) => sum + item.bytesUploaded, 0),
    [state.items],
  );
  const percent = totalBytes === 0 ? 0 : Math.round((uploadedBytes / totalBytes) * 100);
  const canUpload = vaultId.length > 0;
  const nonCompletedItems = useMemo(
    () => state.items.filter(item => item.status !== 'completed'),
    [state.items],
  );
  const completedItems = useMemo(
    () => state.items.filter(item => item.status === 'completed'),
    [state.items],
  );

  useEffect(() => {
    if (!vaultId) {
      return;
    }

    void uploadManager.reconcileVault(vaultId);
  }, [vaultId]);

  function handleFiles(files: File[]) {
    if (!canUpload || files.length === 0) {
      return;
    }

    uploadManager.addFiles({ vaultId, files });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    handleFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function handleClearAll() {
    const confirmed = window.confirm(
      'Cancel active uploads and clear the entire transfer queue? Completed items will also be removed from Transfers, but uploaded documents will remain in their vaults.',
    );

    if (!confirmed) {
      return;
    }

    void uploadManager.clearAll();
  }

  return (
    <section className="space-y-6 pb-8">
      <PageIntro
        eyebrow="Vault Operations"
        title="Batch Upload"
        description={
          isVaultLocked
            ? `Manage large transfer queues for ${activeVaultName ?? 'this vault'} without leaving the current workspace.`
            : 'Manage large transfer queues in one page without losing track of progress.'
        }
        actions={(
          <div className="flex flex-wrap gap-3">
            <Link to={vaultId ? `/vaults/${vaultId}/documents` : '/documents'} className="vault-link">Back to documents</Link>
          </div>
        )}
      />

      <SurfacePanel className="space-y-5">
        <div className={`grid gap-4 ${isVaultLocked ? '' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
          {isVaultLocked ? (
            <div className="rounded-[24px] border border-border/70 bg-secondary/20 px-5 py-4">
              <p className="vault-label">Target vault</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{activeVaultName ?? 'Selected vault'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Files added here will be uploaded directly into this vault.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <span id="transfer-vault-label" className="vault-label">Target vault</span>
              <Select
                value={vaultId || '__none__'}
                onValueChange={value => setSearchParams(value === '__none__' ? {} : { vaultId: value })}
              >
                <SelectTrigger aria-labelledby="transfer-vault-label" className={vaultInputClassName}>
                  <SelectValue placeholder="Select a vault" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a vault</SelectItem>
                  {(data?.vaults ?? []).map(vault => (
                    <SelectItem key={vault.id} value={vault.id}>{vault.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              'group flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-secondary/20 px-6 text-center transition',
              canUpload ? 'hover:border-primary/40 hover:bg-secondary/40' : 'cursor-not-allowed opacity-70',
            )}
            disabled={!canUpload}
          >
            <div className="flex size-16 items-center justify-center rounded-2xl bg-card text-primary shadow-[0_18px_36px_rgba(19,27,46,0.08)]">
              <FileUp className="size-7" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-extrabold tracking-[-0.04em] text-foreground">
              Drag and drop files here
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {isVaultLocked
                ? 'Chunked uploads land in a resumable queue for this vault so you can keep adding files without restarting the workflow.'
                : 'Choose a target vault, then add files into a resumable queue without restarting the workflow.'}
            </p>
            <span className="mt-5 inline-flex h-11 items-center rounded-xl bg-card px-4 text-sm font-semibold text-foreground ring-1 ring-border/70">
              Browse files
            </span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
      </SurfacePanel>

      {state.hydratedFromStorage && state.items.some(item => item.error?.includes('Previous upload session found')) ? (
        <StatusBanner>
          Previous upload session found. Route changes keep uploads alive, but after a full refresh the browser requires selecting the original files again before resume.
        </StatusBanner>
      ) : null}

      <StatusBanner>
        Completed uploads remain in Transfers for 24 hours, then are automatically pruned from the queue. Documents remain available in their vaults.
      </StatusBanner>

      {state.processingCount > 0 ? (
        <StatusBanner>
          {state.processingCount} file{state.processingCount === 1 ? '' : 's'} uploaded and now being processed by Arkivra. Completion updates are coming from the server.
        </StatusBanner>
      ) : null}

      <SurfacePanel className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
              {state.items.length} files in transfer queue
            </p>
            <p className="text-sm text-muted-foreground">
              {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} transferred
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Transfer actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  disabled={!canUpload}
                  onSelect={() => {
                    inputRef.current?.click();
                  }}
                >
                  <Plus className="size-4 text-primary" />
                  Add files
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={state.items.length === 0}
                  onSelect={() => {
                    uploadManager.pauseAll();
                  }}
                >
                  <Pause className="size-4 text-primary" />
                  Pause all
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={state.items.length === 0}
                  onSelect={() => {
                    uploadManager.resumeAll();
                  }}
                >
                  <Play className="size-4 text-primary" />
                  Resume all
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={completedItems.length === 0}
                  onSelect={() => {
                    uploadManager.clearCompleted();
                  }}
                >
                  <CheckCircle2 className="size-4 text-primary" />
                  Clear completed
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={state.items.length === 0}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={handleClearAll}
                >
                  <Trash2 className="size-4 text-destructive" />
                  Cancel and clear all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
          <div className="h-3 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-right font-display text-4xl font-extrabold tracking-[-0.06em] text-foreground">
            {percent}%
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="overflow-hidden p-0">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_140px_160px_160px] gap-4 border-b border-border/70 px-6 py-4 text-sm text-muted-foreground md:grid">
          <span>File name</span>
          <span>Size</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {state.items.length === 0 ? (
          <p className="px-6 py-10 text-sm text-muted-foreground">No transfers yet. Add files above to start a batch upload.</p>
        ) : nonCompletedItems.map(item => (
          <div key={item.id} className="border-b border-border/60 px-6 py-4 last:border-b-0">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_140px_160px_160px] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{item.fileName}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      item.status === 'failed' ? 'bg-destructive' : 'bg-primary',
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{formatBytes(item.size)}</p>

              <div className="flex items-center gap-2 text-sm">
                {item.status === 'completed' ? <CheckCircle2 className="size-4 text-primary" /> : null}
                {item.status === 'failed' ? <AlertCircle className="size-4 text-destructive" /> : null}
                {item.status === 'uploading' || item.status === 'processing' ? <LoaderCircle className="size-4 animate-spin text-primary" /> : null}
                <span className={cn(item.status === 'failed' && 'text-destructive')}>{statusLabel(item.status)}</span>
              </div>

              <div className="flex items-center justify-end gap-2">
                {item.status === 'failed' ? (
                  <Button variant="ghost" size="sm" onClick={() => void uploadManager.retryFailed(item.id)}>
                    Retry
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => void uploadManager.remove(item.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {item.error ? (
              <p className="mt-2 text-sm text-destructive">{item.error}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {formatBytes(item.bytesUploaded)} uploaded • {Math.round(item.progress)}%
              </p>
            )}
          </div>
        ))}

        {completedItems.length > 0 ? (
          <div className={cn(nonCompletedItems.length > 0 && 'border-t border-border/60')}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-secondary/30"
              onClick={() => setIsCompletedExpanded(expanded => !expanded)}
            >
              <div>
                <p className="font-medium text-foreground">Completed ({completedItems.length})</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recent completed uploads remain visible here for up to 24 hours.
                </p>
              </div>
              <ChevronDown className={cn('size-5 text-muted-foreground transition-transform', isCompletedExpanded && 'rotate-180')} />
            </button>

            {isCompletedExpanded ? completedItems.map(item => (
              <div key={item.id} className="border-t border-border/60 px-6 py-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_140px_160px_160px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.fileName}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">{formatBytes(item.size)}</p>

                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-primary" />
                    <span>Done</span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => void uploadManager.remove(item.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {formatBytes(item.bytesUploaded)} uploaded • 100%
                </p>
              </div>
            )) : null}
          </div>
        ) : null}
      </SurfacePanel>
    </section>
  );
}

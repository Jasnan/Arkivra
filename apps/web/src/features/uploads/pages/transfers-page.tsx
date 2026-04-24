import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileUp,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PageIntro,
  StatusBanner,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBytes } from '@/features/documents/documents.utils';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { cn } from '@/lib/utils';
import { uploadManager } from '../upload-manager';
import { useUploadManagerState } from '../use-upload-manager';

function statusLabel(status: string) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'uploading':
      return 'Uploading';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

export function TransfersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useVaultsQuery();
  const state = useUploadManagerState();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const vaultId = searchParams.get('vaultId') ?? data?.vaults[0]?.id ?? '';
  const isVaultLocked = searchParams.get('locked') === 'true' && vaultId.length > 0;
  const activeVaultName = (data?.vaults ?? []).find((vault) => vault.id === vaultId)?.name ?? null;
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
    () => state.items.filter((item) => item.status !== 'completed'),
    [state.items],
  );
  const completedItems = useMemo(
    () => state.items.filter((item) => item.status === 'completed'),
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
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      'Cancel active uploads and clear the entire transfer queue? Completed items will also be removed from Transfers, but uploaded documents will remain in their vaults.',
    );

    if (!confirmed) {
      return;
    }

    void uploadManager.clearAll();
  }

  return (
    <section className="space-y-4 pb-8">
      <PageIntro
        title="Upload"
        description="Add files to a vault and monitor the transfer queue."
        actions={
          <Link to={vaultId ? `/vaults/${vaultId}/documents` : '/documents'} className="vault-link">
            Back
          </Link>
        }
      />

      <div className="space-y-3">
        <div className="space-y-2">
          <span id="transfer-vault-label" className="text-sm font-medium text-muted-foreground">
            Vault
          </span>
          {isVaultLocked ? (
            <div className="flex h-10 w-full max-w-[17.5rem] items-center rounded-lg border border-border/70 bg-secondary/20 px-4 text-sm font-medium text-foreground ">
              {activeVaultName ?? 'Selected vault'}
            </div>
          ) : (
            <Select
              value={vaultId || '__none__'}
              onValueChange={(value) =>
                setSearchParams(value === '__none__' ? {} : { vaultId: value })
              }
            >
              <SelectTrigger
                aria-labelledby="transfer-vault-label"
                className={`${vaultInputClassName} h-10 w-full max-w-[17.5rem] rounded-lg bg-secondary/20 px-4 text-sm text-foreground `}
              >
                <SelectValue placeholder="Select a vault" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a vault</SelectItem>
                {(data?.vaults ?? []).map((vault) => (
                  <SelectItem key={vault.id} value={vault.id}>
                    {vault.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <SurfacePanel className="rounded-lg p-5 sm:p-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              'group flex min-h-[300px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,248,255,0.88))] px-6 py-12 text-center  transition sm:px-10 sm:py-16',
              canUpload
                ? 'hover:border-primary/30 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(242,245,255,0.96))]'
                : 'cursor-not-allowed opacity-70',
            )}
            disabled={!canUpload}
          >
            <div className="flex size-[4.8rem] items-center justify-center rounded-lg bg-card text-primary ">
              <FileUp className="size-8" />
            </div>
            <h2 className="mt-6 font-display text-xl font-extrabold  text-foreground sm:text-xl">
              Drag and drop files here
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Select a vault and add files
            </p>
            <span className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground  transition group-hover:bg-primary/95">
              Browse files
            </span>
          </button>
        </SurfacePanel>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {state.hydratedFromStorage &&
      state.items.some((item) => item.error?.includes('Previous upload session found')) ? (
        <StatusBanner>
          Previous upload session found. Route changes keep uploads alive, but after a full refresh
          the browser requires selecting the original files again before resume.
        </StatusBanner>
      ) : null}

      <SurfacePanel className="space-y-4 rounded-lg p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold  text-foreground">Upload queue</h2>
              <p className="text-sm text-muted-foreground">
                This page only tracks the file upload itself. Completed uploads are kept for 24
                hours.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{state.items.length} files</span>
              <span className="h-5 w-px bg-border/80" />
              <span>{formatBytes(uploadedBytes)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Transfer actions"
                  className="rounded-lg"
                >
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

        <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary/90">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-right font-display text-2xl font-semibold leading-none text-foreground">
            {percent}%
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel className="overflow-hidden rounded-lg p-0">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_140px_160px_160px] gap-4 border-b border-border/70 px-7 py-4 text-sm text-muted-foreground md:grid">
          <span>File name</span>
          <span>Size</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {state.items.length === 0 ? (
          <p className="px-7 py-12 text-center text-sm text-muted-foreground">
            Add files above to start uploading
          </p>
        ) : (
          nonCompletedItems.map((item) => (
            <div key={item.id} className="border-b border-border/60 px-7 py-4 last:border-b-0">
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
                  {item.status === 'completed' ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : null}
                  {item.status === 'failed' ? (
                    <AlertCircle className="size-4 text-destructive" />
                  ) : null}
                  {item.status === 'uploading' ? (
                    <LoaderCircle className="size-4 animate-spin text-primary" />
                  ) : null}
                  <span className={cn(item.status === 'failed' && 'text-destructive')}>
                    {statusLabel(item.status)}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void uploadManager.remove(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {item.error ? (
                <p className="mt-2 text-sm text-destructive">{item.error}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.status === 'completed'
                    ? `${formatBytes(item.bytesUploaded)} uploaded • complete`
                    : `${formatBytes(item.bytesUploaded)} uploaded • ${Math.round(item.progress)}%`}
                </p>
              )}
            </div>
          ))
        )}

        {completedItems.length > 0 ? (
          <div className={cn(nonCompletedItems.length > 0 && 'border-t border-border/60')}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-7 py-4 text-left transition hover:bg-secondary/30"
              onClick={() => setIsCompletedExpanded((expanded) => !expanded)}
            >
              <div>
                <p className="font-medium text-foreground">Completed ({completedItems.length})</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recent completed uploads remain visible here for up to 24 hours.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'size-5 text-muted-foreground transition-transform',
                  isCompletedExpanded && 'rotate-180',
                )}
              />
            </button>

            {isCompletedExpanded
              ? completedItems.map((item) => (
                  <div key={item.id} className="border-t border-border/60 px-7 py-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_140px_160px_160px] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{item.fileName}</p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground">{formatBytes(item.size)}</p>

                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-primary" />
                        <span>Done</span>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void uploadManager.remove(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatBytes(item.bytesUploaded)} uploaded • 100%
                    </p>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </SurfacePanel>
    </section>
  );
}

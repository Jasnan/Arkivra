'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Archive, ArrowRight, FileText, HardDrive, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { BaseLayout } from '@/components/layouts/base-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useHeaderActions } from '@/contexts/header-actions-context';
import { formatShortDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { CreateVaultDialog } from './components/create-vault-dialog';
import {
  VaultItemContextMenu,
  type VaultItemContextMenuState,
} from './components/vault-item-context-menu';
import { VaultsViewToggle } from './components/vaults-view-toggle';
import { VaultDeleteConfirmDialog } from './vault-management-page';
import {
  deleteVault,
  getMe,
  isPermissionRequestResponse,
  listVaults,
  type VaultSummary,
} from './vaults.api';
import { useVaultsView } from './use-vaults-view';

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  const formatted =
    amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1);

  return `${formatted} ${units[exponent]}`;
}

const formatVaultDate = formatShortDate;

function getVaultDescription(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === 'Credise default vault') {
    return 'Default vault';
  }

  return value;
}

function getDescriptionPreview(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.length <= 120) {
    return value;
  }

  return `${value.slice(0, 117).trimEnd()}...`;
}

function getParticipationLabel(vault: VaultSummary) {
  if (vault.role === 'owner') return 'Owner';
  if (vault.role === 'editor') return 'Editor';
  if (vault.role === 'viewer') return 'Viewer';
  return 'No participation';
}

function getParticipationBadgeClass(vault: VaultSummary) {
  if (vault.role === null) {
    return 'border-border bg-muted text-muted-foreground';
  }

  return 'border-primary/20 bg-primary/10 text-foreground';
}

const demoVaults: VaultSummary[] = [
  {
    id: 'demo-vault-insurance',
    name: 'Insurance',
    description: 'Health, home, car, travel policies',
    fileCount: 186,
    totalSize: 558 * 1024 * 1024,
    createdAt: '2026-01-04T10:00:00.000Z',
    updatedAt: '2026-06-18T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-vehicles',
    name: 'Vehicles',
    description: 'Registration, service, manuals',
    fileCount: 161,
    totalSize: 724.5 * 1024 * 1024,
    createdAt: '2026-01-08T10:00:00.000Z',
    updatedAt: '2026-06-12T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-travel',
    name: 'Travel',
    description: 'Trip plans, bookings, tickets',
    fileCount: 216,
    totalSize: 729 * 1024 * 1024,
    createdAt: '2026-01-12T10:00:00.000Z',
    updatedAt: '2026-06-03T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-home-inventory',
    name: 'Home Inventory',
    description: 'Valuables, warranties, serial numbers',
    fileCount: 56,
    totalSize: 63 * 1024 * 1024,
    createdAt: '2026-01-16T10:00:00.000Z',
    updatedAt: '2026-05-25T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-work',
    name: 'Work',
    description: 'Work related documents',
    fileCount: 71,
    totalSize: 319.5 * 1024 * 1024,
    createdAt: '2026-01-20T10:00:00.000Z',
    updatedAt: '2026-05-17T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-tax-records',
    name: 'Tax Records',
    description: 'Returns, receipts, deductions',
    fileCount: 94,
    totalSize: 248.2 * 1024 * 1024,
    createdAt: '2026-01-24T10:00:00.000Z',
    updatedAt: '2026-05-09T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-property',
    name: 'Property',
    description: 'Lease, mortgage, repairs',
    fileCount: 128,
    totalSize: 486.7 * 1024 * 1024,
    createdAt: '2026-01-28T10:00:00.000Z',
    updatedAt: '2026-04-28T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
  {
    id: 'demo-vault-medical',
    name: 'Medical',
    description: 'Reports, prescriptions, visits',
    fileCount: 143,
    totalSize: 392.4 * 1024 * 1024,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-04-19T10:00:00.000Z',
    role: 'owner',
    isAdmin: false,
    isMember: true,
  },
];

function isDemoVault(vault: VaultSummary) {
  return vault.id.startsWith('demo-vault-');
}

function VaultGrid({
  vaults,
  onOpenVault,
  onOpenContextMenu,
}: {
  vaults: VaultSummary[];
  onOpenVault: (vault: VaultSummary) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, vault: VaultSummary) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,19rem))] justify-start gap-2">
      {vaults.map((vault) => {
        const description = getDescriptionPreview(getVaultDescription(vault.description));

        return (
          <Card
            key={vault.id}
            role="link"
            tabIndex={0}
            className="group cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            onClick={() => onOpenVault(vault)}
            onContextMenu={(event) => onOpenContextMenu(event, vault)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenVault(vault);
              }
            }}
          >
            <CardContent className="flex h-36 flex-col items-center justify-center p-3 text-center">
              <div className="flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Archive className="size-3.5" strokeWidth={1.7} />
              </div>
              <h2 className="mt-1.5 line-clamp-1 min-h-4 max-w-full text-sm font-semibold leading-4">
                {vault.name}
              </h2>
              <p
                className={cn(
                  'mt-0.5 line-clamp-2 min-h-6 max-w-full text-xs leading-3 text-muted-foreground',
                  !description && 'invisible',
                )}
              >
                {description ?? 'Description'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HardDrive className="size-3.5" />
                  {formatBytes(vault.totalSize)}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn('mt-1 h-5 px-2 text-xs', getParticipationBadgeClass(vault))}
              >
                {getParticipationLabel(vault)}
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VaultList({
  vaults,
  onOpenVault,
  onOpenContextMenu,
}: {
  vaults: VaultSummary[];
  onOpenVault: (vault: VaultSummary) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, vault: VaultSummary) => void;
}) {
  return (
    <div className="-mt-4 overflow-hidden border-b bg-background md:-mt-6">
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_4rem_5.75rem_7.5rem] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid lg:px-6">
        <span>Name</span>
        <span>Access</span>
        <span>Files</span>
        <span>Size</span>
        <span>Modified</span>
      </div>
      <div>
        {vaults.map((vault) => (
          <div
            key={vault.id}
            role="link"
            tabIndex={0}
            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-4 py-2 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_7rem_4rem_5.75rem_7.5rem] lg:px-6"
            onClick={() => onOpenVault(vault)}
            onContextMenu={(event) => onOpenContextMenu(event, vault)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenVault(vault);
              }
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Archive className="size-5" strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{vault.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                  {getParticipationLabel(vault)} · {vault.fileCount}{' '}
                  {vault.fileCount === 1 ? 'file' : 'files'} · {formatBytes(vault.totalSize)}
                </div>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn('hidden md:inline-flex', getParticipationBadgeClass(vault))}
            >
              {getParticipationLabel(vault)}
            </Badge>
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {vault.fileCount}
            </span>
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {formatBytes(vault.totalSize)}
            </span>
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {formatVaultDate(vault.updatedAt ?? vault.createdAt)}
            </span>
            <ArrowRight className="size-4 text-muted-foreground md:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VaultsPage() {
  const navigate = useNavigate();
  const [view] = useVaultsView();
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [contextMenu, setContextMenu] = useState<VaultItemContextMenuState | null>(null);
  const [pendingDeleteVault, setPendingDeleteVault] = useState<VaultSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingVault, setDeletingVault] = useState(false);
  const [canCreateVault, setCanCreateVault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayVaults = useMemo(
    () => [...vaults].sort((a, b) => a.name.localeCompare(b.name)).concat(demoVaults),
    [vaults],
  );
  const headerActions = useMemo(
    () => (
      <>
        <VaultsViewToggle />
        <CreateVaultDialog />
      </>
    ),
    [],
  );

  useHeaderActions(headerActions);

  const loadVaults = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const [vaultsResult, meResult] = await Promise.allSettled([listVaults(), getMe()]);

    if (vaultsResult.status === 'fulfilled') {
      setVaults(vaultsResult.value.vaults);
    } else {
      setErrorMessage(
        vaultsResult.reason instanceof Error
          ? vaultsResult.reason.message
          : 'Unable to load vaults.',
      );
    }

    if (meResult.status === 'fulfilled') {
      setCanCreateVault(meResult.value.canCreateVault);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadVaults();
  }, [loadVaults]);

  useEffect(() => {
    function handleVaultCreated() {
      void loadVaults();
    }

    window.addEventListener('arkivra:vault-created', handleVaultCreated);

    return () => {
      window.removeEventListener('arkivra:vault-created', handleVaultCreated);
    };
  }, [loadVaults]);

  function openVault(vault: VaultSummary) {
    if (isDemoVault(vault)) return;

    navigate(`/vaults/${vault.id}`);
  }

  function openSettings(vault: VaultSummary) {
    if (isDemoVault(vault)) return;

    navigate(`/vaults/${vault.id}/settings`);
  }

  function openActivity(vault: VaultSummary) {
    if (isDemoVault(vault)) return;

    navigate(`/vaults/${vault.id}/activity`);
  }

  async function confirmDeleteVault() {
    if (pendingDeleteVault === null || deletingVault) return;

    setDeletingVault(true);
    setDeleteError(null);

    try {
      const result = await deleteVault({ vaultId: pendingDeleteVault.id });
      if (isPermissionRequestResponse(result)) {
        toast.success('Vault deletion request queued for admin approval.');
      } else {
        toast.success('Vault deleted.');
      }
      setPendingDeleteVault(null);
      await loadVaults();
    } catch (deleteRequestError) {
      setDeleteError(
        deleteRequestError instanceof Error
          ? deleteRequestError.message
          : 'Could not delete vault.',
      );
    } finally {
      setDeletingVault(false);
    }
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, vault: VaultSummary) {
    event.preventDefault();
    event.stopPropagation();
    if (isDemoVault(vault)) return;

    setContextMenu({
      vault,
      x: event.clientX,
      y: event.clientY,
    });
  }

  return (
    <BaseLayout>
      {contextMenu ? (
        <VaultItemContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenVault={openVault}
          onOpenSettings={openSettings}
          onOpenActivity={openActivity}
          onDeleteVault={(vault) => {
            setPendingDeleteVault(vault);
            setDeleteError(null);
          }}
          deleteDisabled={deletingVault}
        />
      ) : null}
      <VaultDeleteConfirmDialog
        open={pendingDeleteVault !== null}
        vault={pendingDeleteVault}
        isPending={deletingVault}
        errorMessage={deleteError}
        onCancel={() => {
          if (deletingVault) return;
          setPendingDeleteVault(null);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDeleteVault()}
      />
      {loading ? (
        <div className="px-4 lg:px-6">
          <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
            Loading vaults...
          </div>
        </div>
      ) : errorMessage ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        </div>
      ) : displayVaults.length === 0 ? (
        <div className="px-4 lg:px-6">
          <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border bg-muted/20 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <ShieldCheck className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">No vaults yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {canCreateVault
                ? 'Create your first vault to start storing documents.'
                : 'No vaults available yet. Request a vault and an admin can approve it.'}
            </p>
          </div>
        </div>
      ) : view === 'grid' ? (
        <div className="px-4 lg:px-6">
          <VaultGrid
            vaults={displayVaults}
            onOpenVault={openVault}
            onOpenContextMenu={openContextMenu}
          />
        </div>
      ) : (
        <VaultList
          vaults={displayVaults}
          onOpenVault={openVault}
          onOpenContextMenu={openContextMenu}
        />
      )}
    </BaseLayout>
  );
}

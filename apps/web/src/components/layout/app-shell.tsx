import type { CSSProperties, PropsWithChildren } from 'react';
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Compass,
  File,
  FileSearch,
  LogOut,
  MessageSquare,
  SearchX,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Trash2,
  Upload,
  UserCircle2,
  Vault,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { formatDate } from '@/features/documents/documents.utils';
import { useDocumentQuery } from '@/features/documents/documents.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useUploadManagerState } from '@/features/uploads/use-upload-manager';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'arkivra.sidebarCollapsed';

function getStoredSidebarCollapsedValue() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage?.getItem?.(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistSidebarCollapsedValue(isCollapsed: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem?.(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? 'true' : 'false');
  } catch {}
}

interface BreadcrumbEntry {
  label: string;
  to?: string;
}

function truncateBreadcrumbLabel(label: string, maxLength = 36) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildBreadcrumbs({
  pathname,
  transferVaultId,
  vaultName,
  documentName,
}: {
  pathname: string;
  transferVaultId?: string | null;
  vaultName?: string;
  documentName?: string;
}): BreadcrumbEntry[] {
  const parts = pathname.split('/').filter(Boolean);
  const currentDocumentLabel = truncateBreadcrumbLabel(documentName ?? 'Document');

  if (parts.length === 0) {
    return [{ label: 'Vaults' }];
  }

  if (pathname === '/vaults') {
    return [{ label: 'Vaults' }];
  }

  if (pathname === '/documents') {
    return [{ label: 'All Documents' }];
  }

  if (pathname === '/chat') {
    return [{ label: 'Chat' }];
  }

  if (pathname === '/documents/trash') {
    return [{ label: 'All Documents', to: '/documents' }, { label: 'Trash' }];
  }

  if (parts[0] === 'documents' && parts[1] && parts[2]) {
    return [{ label: 'All Documents', to: '/documents' }, { label: currentDocumentLabel }];
  }

  if (pathname === '/tags') {
    return [{ label: 'Tags' }];
  }

  if (pathname === '/transfers') {
    if (transferVaultId) {
      return [
        { label: 'Vaults', to: '/vaults' },
        { label: vaultName ?? 'Vault', to: `/vaults/${transferVaultId}/documents` },
        { label: 'Upload' },
      ];
    }

    return [{ label: 'All Documents', to: '/documents' }, { label: 'Upload' }];
  }

  if (pathname === '/search') {
    return [{ label: 'All Documents', to: '/documents' }, { label: 'Search' }];
  }

  if (pathname === '/settings') {
    return [{ label: 'Settings' }];
  }

  if (pathname === '/admin') {
    return [{ label: 'Admin' }];
  }

  if (pathname === '/about') {
    return [{ label: 'About' }];
  }

  if (parts[0] === 'vaults' && parts[1]) {
    const vaultLabel = vaultName ?? 'Vault';
    const vaultDocumentsPath = `/vaults/${parts[1]}/documents`;
    const base: BreadcrumbEntry[] = [
      { label: 'Vaults', to: '/vaults' },
      { label: vaultLabel, to: vaultDocumentsPath },
    ];

    if (parts[2] === 'settings') {
      return [...base, { label: 'Settings' }];
    }

    if (parts[2] === 'tags') {
      return [...base, { label: 'Tags' }];
    }

    if (parts[2] === 'chat') {
      return [...base, { label: 'Chat' }];
    }

    if (parts[2] === 'documents' && parts[3] === 'trash') {
      return [...base, { label: 'Trash' }];
    }

    if (parts[2] === 'documents' && parts[3] && parts[4] === 'chat') {
      return [...base, { label: currentDocumentLabel }, { label: 'Chat' }];
    }

    if (parts[2] === 'documents' && parts[3]) {
      return [...base, { label: currentDocumentLabel }];
    }

    if (parts[2] === 'documents') {
      return base;
    }

    return base;
  }

  return [{ label: 'Arkivra' }];
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const uploadState = useUploadManagerState();
  const { data: sessionData } = authClient.useSession();
  const [searchValue, setSearchValue] = useState('');
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return getStoredSidebarCollapsedValue();
  });
  const deferredSearchValue = useDeferredValue(searchValue.trim());
  const transferVaultId = useMemo(
    () => new URLSearchParams(location.search).get('vaultId'),
    [location.search],
  );
  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeVaultId =
    pathParts[0] === 'vaults'
      ? pathParts[1]
      : pathParts[0] === 'documents' && pathParts.length >= 3
        ? pathParts[1]
        : transferVaultId;
  const activeDocumentRoute = useMemo(() => {
    if (pathParts[0] === 'vaults' && pathParts[2] === 'documents' && pathParts[3]) {
      return { vaultId: pathParts[1] ?? '', documentId: pathParts[3] ?? '' };
    }

    if (pathParts[0] === 'documents' && pathParts[1] && pathParts[2]) {
      return { vaultId: pathParts[1], documentId: pathParts[2] };
    }

    return null;
  }, [pathParts]);
  const activeVaultName = useMemo(
    () => (vaultsQuery.data?.vaults ?? []).find((vault) => vault.id === activeVaultId)?.name,
    [activeVaultId, vaultsQuery.data?.vaults],
  );
  const activeDocumentQuery = useDocumentQuery({
    vaultId: activeDocumentRoute?.vaultId ?? '',
    documentId: activeDocumentRoute?.documentId ?? '',
  });
  const breadcrumbs = useMemo(
    () =>
      buildBreadcrumbs({
        pathname: location.pathname,
        transferVaultId,
        vaultName: activeVaultName,
        documentName: activeDocumentQuery.data?.document.name,
      }),
    [activeDocumentQuery.data?.document.name, activeVaultName, location.pathname, transferVaultId],
  );

  useEffect(() => {
    persistSidebarCollapsedValue(isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  const { primaryNavItems, footerNavItems } = useMemo(() => {
    const primaryItems = [
      { to: '/vaults', label: 'Vaults', icon: Vault },
      { to: '/chat', label: 'Chat', icon: MessageSquare },
      { to: '/documents', label: 'All Documents', icon: File },
      { to: '/tags', label: 'Tags', icon: Tags },
      { to: '/transfers', label: 'Transfers', icon: Upload },
      { to: '/documents/trash', label: 'Trash', icon: Trash2 },
    ];
    const secondaryItems = [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/about', label: 'About', icon: Compass },
    ];

    if (meQuery.data?.isGlobalAdmin) {
      secondaryItems.splice(1, 0, { to: '/admin', label: 'Admin', icon: ShieldCheck });
    }

    return {
      primaryNavItems: primaryItems,
      footerNavItems: secondaryItems,
    };
  }, [meQuery.data?.isGlobalAdmin]);

  const quickSearchQuery = useGlobalSearchDocumentsQuery({
    query: deferredSearchValue,
    pageIndex: 0,
    pageSize: 8,
    enabled: isQuickSearchOpen && deferredSearchValue.length > 0,
  });

  function closeQuickSearch() {
    setSearchValue('');
    setIsQuickSearchOpen(false);
  }

  function openQuickSearch() {
    setIsQuickSearchOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#f4f4f2] text-foreground dark:bg-[#161616]">
      <SidebarProvider
        open={!isSidebarCollapsed}
        onOpenChange={(open) => setIsSidebarCollapsed(!open)}
        className="w-full"
        style={
          {
            '--sidebar-width': '17rem',
            '--sidebar-width-icon': '4.75rem',
            '--header-height': '3.5rem',
          } as CSSProperties
        }
      >
        <AppSidebar
          variant="default"
          primaryNavItems={primaryNavItems}
          footerNavItems={footerNavItems}
        />

        <SidebarInset className="min-h-screen bg-[#fcfcfb] dark:bg-[#1b1b1b]">
          <header className="sticky top-0 z-40 flex h-(--header-height) shrink-0 items-center border-b border-border/60 bg-[#fcfcfb]/95 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 supports-[backdrop-filter]:bg-[#fcfcfb]/85 dark:bg-[#1b1b1b]/95 dark:supports-[backdrop-filter]:bg-[#1b1b1b]/85">
            <div className="flex w-full items-center gap-2 px-4 lg:px-6">
              <SidebarTrigger className="-ml-1 hidden lg:inline-flex" />
              <Separator
                orientation="vertical"
                className="mx-2 hidden data-[orientation=vertical]:h-4 lg:block"
              />
              <Breadcrumb className="min-w-0">
                <BreadcrumbList className="flex-nowrap">
                  {breadcrumbs.map((item, index) => {
                    const isLast = index === breadcrumbs.length - 1;

                    return (
                      <Fragment key={`${item.to ?? item.label}-${item.label}`}>
                        {index > 0 ? <BreadcrumbSeparator /> : null}
                        <BreadcrumbItem className="min-w-0">
                          {item.to && !isLast ? (
                            <Link
                              to={item.to}
                              className="truncate font-medium transition hover:text-foreground"
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>

              <div className="ml-auto hidden w-full max-w-sm items-center gap-2 md:flex">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Global search"
                    placeholder="Quick search"
                    className="vault-input h-9 rounded-md bg-muted/40 pl-9"
                    readOnly
                    onFocus={openQuickSearch}
                    onClick={openQuickSearch}
                  />
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2 md:ml-0">
                <ThemeToggle />

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Open account menu"
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                    >
                      <UserCircle2 className="size-[18px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="py-2">
                      <p className="font-medium text-foreground">
                        {sessionData?.user.email ?? 'Signed in'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meQuery.data?.isGlobalAdmin ? 'Admin' : 'Vault member'}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <NavLink to="/settings">
                        <Settings className="size-4 text-primary" />
                        Account settings
                      </NavLink>
                    </DropdownMenuItem>
                    {meQuery.data?.isGlobalAdmin ? (
                      <DropdownMenuItem asChild>
                        <NavLink to="/admin">
                          <ShieldCheck className="size-4 text-primary" />
                          Admin
                        </NavLink>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => {
                        void authClient.signOut();
                      }}
                    >
                      <LogOut className="size-4 text-primary" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
                {uploadState.activeCount + uploadState.queuedCount > 0 ? (
                  <div className="px-4 lg:px-6">
                    <NavLink
                      to="/transfers"
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm transition hover:bg-muted/50 hover:text-foreground"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                          <Upload className="size-4" />
                        </span>
                        Uploading {uploadState.activeCount + uploadState.queuedCount} file
                        {uploadState.activeCount + uploadState.queuedCount === 1 ? '' : 's'}
                      </span>
                      <span className="text-xs uppercase tracking-[0.16em]">View queue</span>
                    </NavLink>
                  </div>
                ) : null}

                <div className="space-y-3 px-4 lg:hidden">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      aria-label="Global search"
                      placeholder="Quick search"
                      className="vault-input pl-11"
                      readOnly
                      onFocus={openQuickSearch}
                      onClick={openQuickSearch}
                    />
                  </div>

                  <nav className="flex gap-2 overflow-x-auto">
                    {[...primaryNavItems, ...footerNavItems].map((item) => {
                      const Icon = item.icon;

                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/documents'}
                          className={({ isActive }) =>
                            cn(
                              'inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm font-medium whitespace-nowrap transition',
                              isActive
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                            )
                          }
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <Icon className="size-4" />
                          </span>
                          {item.label}
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>

                <main className="flex-1 px-4 pb-4 lg:px-6 lg:pb-6">{children}</main>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Dialog
        open={isQuickSearchOpen}
        onOpenChange={(open) => {
          if (open) {
            openQuickSearch();
            return;
          }

          closeQuickSearch();
        }}
      >
        <DialogContent
          hideCloseButton
          className="max-w-4xl overflow-hidden bg-background p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <div className="border-b border-border/70 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Quick search modal"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search across all accessible documents..."
                  className="vault-input pl-11 pr-11"
                  autoFocus
                />
                {searchValue.length > 0 ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                    onClick={() => setSearchValue('')}
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
                onClick={closeQuickSearch}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
            {deferredSearchValue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-lg bg-secondary text-primary">
                  <FileSearch className="size-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Start typing to search</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Results will appear here without leaving the current page.
                  </p>
                </div>
              </div>
            ) : quickSearchQuery.isLoading ? (
              <p className="px-2 py-10 text-sm text-muted-foreground">Searching documents...</p>
            ) : quickSearchQuery.isError ? (
              <p className="px-2 py-10 text-sm text-destructive">Unable to run quick search.</p>
            ) : (quickSearchQuery.data?.results.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <SearchX className="size-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground">No matching documents</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a different name, phrase, or keyword.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {(quickSearchQuery.data?.results ?? []).map((result) => (
                  <button
                    key={`${result.vaultId}-${result.documentId}`}
                    type="button"
                    className="w-full rounded-lg border border-border/70 bg-background px-4 py-4 text-left transition hover:bg-secondary/45"
                    onClick={() => {
                      closeQuickSearch();
                      navigate(`/documents/${result.vaultId}/${result.documentId}`);
                    }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-base font-semibold text-foreground">
                            {result.name}
                          </p>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {result.vaultName} • {result.mimeType} • Updated{' '}
                          {formatDate(result.updatedAt)}
                        </p>
                        {result.bestChunk ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                              part.highlighted ? (
                                <mark
                                  key={`${result.documentId}-${part.key}`}
                                  className="rounded bg-accent px-1 text-accent-foreground"
                                >
                                  {part.text}
                                </mark>
                              ) : (
                                <span key={`${result.documentId}-${part.key}`}>{part.text}</span>
                              ),
                            )}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {result.bestChunk?.pageNumber !== null &&
                        result.bestChunk?.pageNumber !== undefined
                          ? `Page ${result.bestChunk.pageNumber}`
                          : 'Match'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

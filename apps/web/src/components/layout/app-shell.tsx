import type { PropsWithChildren } from 'react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Compass,
  File,
  FileSearch,
  LogOut,
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
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useUploadManagerState } from '@/features/uploads/use-upload-manager';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const navBaseClassName = 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all';

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const uploadState = useUploadManagerState();
  const { data: sessionData } = authClient.useSession();
  const [searchValue, setSearchValue] = useState('');
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const quickSearchInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue.trim());

  useEffect(() => {
    if (!isQuickSearchOpen) {
      setSearchValue('');
    }
  }, [isQuickSearchOpen, location.pathname]);

  useEffect(() => {
    setIsProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isQuickSearchOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      quickSearchInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsQuickSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isQuickSearchOpen]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsProfileMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  const { primaryNavItems, footerNavItems } = useMemo(() => {
    const primaryItems = [
      { to: '/vaults', label: 'Vaults', icon: Vault },
      { to: '/documents', label: 'Documents', icon: File },
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
    setIsQuickSearchOpen(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] gap-0 lg:gap-8">
        <aside className="hidden w-[18rem] shrink-0 border-r border-border/70 px-3 py-4 lg:block">
          <div className="sticky top-4 flex min-h-[calc(100vh-2rem)] flex-col gap-6">
            <div className="rounded-2xl border border-border/70 bg-card px-5 py-4">
              <p className="font-display text-2xl font-extrabold tracking-[-0.05em] text-primary">
                Arkivra
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Secure document management</p>
            </div>

            <nav className="space-y-2">
              {primaryNavItems.map(item => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/documents'}
                    className={({ isActive }) =>
                      cn(
                        navBaseClassName,
                        isActive
                          ? 'bg-card text-foreground ring-1 ring-border/70'
                          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                      )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <Icon className="size-4" />
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <nav className="mt-auto space-y-2 border-t border-border/70 pt-4">
              {footerNavItems.map(item => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        navBaseClassName,
                        isActive
                          ? 'bg-card text-foreground ring-1 ring-border/70'
                          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                      )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <Icon className="size-4" />
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <header className="sticky top-0 z-40 bg-background/92 py-4 backdrop-blur">
            <div className="flex flex-col gap-4">
              {(uploadState.activeCount + uploadState.queuedCount + uploadState.processingCount) > 0 ? (
                <NavLink
                  to="/transfers"
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground transition hover:bg-secondary/50 hover:text-foreground"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Upload className="size-4" />
                    </span>
                    Uploading {uploadState.activeCount + uploadState.queuedCount + uploadState.processingCount} file{uploadState.activeCount + uploadState.queuedCount + uploadState.processingCount === 1 ? '' : 's'}
                  </span>
                  <span className="text-xs uppercase tracking-[0.16em]">View queue</span>
                </NavLink>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="relative min-w-0 sm:w-[20rem] lg:w-[30rem]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Global search"
                    placeholder="Quick search"
                    className="vault-input pl-11"
                    readOnly
                    onFocus={() => setIsQuickSearchOpen(true)}
                    onClick={() => setIsQuickSearchOpen(true)}
                  />
                </div>

                <ThemeToggle />

                <div ref={profileMenuRef} className="relative self-end sm:self-auto">
                  <button
                    type="button"
                    aria-label="Open account menu"
                    aria-expanded={isProfileMenuOpen}
                    aria-haspopup="menu"
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition hover:text-foreground"
                    onClick={() => setIsProfileMenuOpen(open => !open)}
                  >
                    <UserCircle2 className="size-5" />
                  </button>
                  {isProfileMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 rounded-xl border border-border/70 bg-card p-2 shadow-[0_18px_38px_rgba(19,27,46,0.12)]"
                    >
                      <div className="px-3 py-2 text-sm">
                        <p className="font-medium text-foreground">{sessionData?.user.email ?? 'Signed in'}</p>
                        <p className="text-xs text-muted-foreground">
                          {meQuery.data?.isGlobalAdmin ? 'Admin' : 'Vault member'}
                        </p>
                      </div>
                      <NavLink
                        to="/settings"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                        onClick={() => setIsProfileMenuOpen(false)}
                      >
                        <Settings className="size-4" />
                        Account settings
                      </NavLink>
                      {meQuery.data?.isGlobalAdmin ? (
                        <NavLink
                          to="/admin"
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                          onClick={() => setIsProfileMenuOpen(false)}
                        >
                          <ShieldCheck className="size-4" />
                          Admin
                        </NavLink>
                      ) : null}
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                        onClick={async () => {
                          setIsProfileMenuOpen(false);
                          await authClient.signOut();
                        }}
                      >
                        <LogOut className="size-4" />
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <nav className="flex gap-2 overflow-x-auto lg:hidden">
              {[...primaryNavItems, ...footerNavItems].map(item => {
                const Icon = item.icon;

                  return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/documents'}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card/80 text-muted-foreground hover:text-foreground',
                        )}
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
          </header>

          <main className="flex-1 pb-12">
            {children}
          </main>
        </div>
      </div>
      {isQuickSearchOpen ? createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-4 py-16 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-border/70 bg-background shadow-[0_24px_60px_rgba(19,27,46,0.18)]">
            <div className="border-b border-border/70 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={quickSearchInputRef}
                    aria-label="Quick search modal"
                    value={searchValue}
                    onChange={event => setSearchValue(event.target.value)}
                    placeholder="Search across all accessible documents..."
                    className="vault-input pl-11 pr-11"
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
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition hover:text-foreground"
                  onClick={closeQuickSearch}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
              {deferredSearchValue.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
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
                  <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
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
                  {(quickSearchQuery.data?.results ?? []).map(result => (
                    <button
                      key={`${result.vaultId}-${result.documentId}`}
                      type="button"
                      className="w-full rounded-xl border border-border/70 bg-card px-4 py-4 text-left transition hover:bg-secondary/45"
                      onClick={() => {
                        closeQuickSearch();
                        navigate(`/vaults/${result.vaultId}/documents/${result.documentId}`);
                      }}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-base font-semibold text-foreground">{result.name}</p>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {result.vaultName} • {result.mimeType} • Updated {formatDate(result.updatedAt)}
                          </p>
                          {result.bestChunk ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {tokenizeSnippet(result.bestChunk.snippet).map(part =>
                                part.highlighted
                                  ? (
                                      <mark key={`${result.documentId}-${part.key}`} className="rounded bg-accent px-1 text-accent-foreground">
                                        {part.text}
                                      </mark>
                                    )
                                  : <span key={`${result.documentId}-${part.key}`}>{part.text}</span>,
                              )}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {result.bestChunk?.pageNumber !== null && result.bestChunk?.pageNumber !== undefined ? `Page ${result.bestChunk.pageNumber}` : 'Match'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

import type { FormEvent, PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Compass,
  FileText,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserCircle2,
  Vault,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { Button } from '@/components/ui/button';
import { useMeQuery } from '@/features/me/me.queries';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const navBaseClassName = 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all';

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const { data: sessionData } = authClient.useSession();
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchValue(params.get('q') ?? '');
  }, [location.search]);

  const navItems = useMemo(() => {
    const baseItems = [
      { to: '/vaults', label: 'Vaults', icon: Vault },
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/search', label: 'Search', icon: Search },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/about', label: 'About', icon: Compass },
    ];

    if (meQuery.data?.isGlobalAdmin) {
      baseItems.splice(3, 0, { to: '/admin', label: 'Admin', icon: ShieldCheck });
    }

    return baseItems;
  }, [meQuery.data?.isGlobalAdmin]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchValue.trim();
    navigate(query.length > 0 ? `/search?q=${encodeURIComponent(query)}` : '/search');
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

            <Button size="lg" className="w-full justify-start" onClick={() => navigate('/vaults/new')}>
              <Plus className="size-4" />
              Create Vault
            </Button>

            <nav className="space-y-2">
              {navItems.map(item => {
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
                    <Icon className="size-4" />
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <form onSubmit={handleSearchSubmit} className="relative min-w-0 sm:w-[20rem] lg:w-[30rem]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Global search"
                    value={searchValue}
                    onChange={event => setSearchValue(event.target.value)}
                    placeholder="Quick search"
                    className="vault-input pl-11"
                  />
                </form>

                <ThemeToggle />

                <details className="group relative self-end sm:self-auto">
                  <summary className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground list-none transition hover:text-foreground">
                    <UserCircle2 className="size-5" />
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border/70 bg-card p-2 shadow-[0_18px_38px_rgba(19,27,46,0.12)]">
                    <div className="px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">{sessionData?.user.email ?? 'Signed in'}</p>
                      <p className="text-xs text-muted-foreground">
                        {meQuery.data?.isGlobalAdmin ? 'Admin' : 'Vault member'}
                      </p>
                    </div>
                    <NavLink
                      to="/settings"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                    >
                      <Settings className="size-4" />
                      Account settings
                    </NavLink>
                    {meQuery.data?.isGlobalAdmin ? (
                      <NavLink
                        to="/admin"
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                      >
                        <ShieldCheck className="size-4" />
                        Admin
                      </NavLink>
                    ) : null}
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                      onClick={async () => {
                        await authClient.signOut();
                      }}
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </div>
                </details>
              </div>

              <nav className="flex gap-2 overflow-x-auto lg:hidden">
                {navItems.map(item => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card/80 text-muted-foreground hover:text-foreground',
                        )}
                    >
                      <Icon className="size-4" />
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
    </div>
  );
}

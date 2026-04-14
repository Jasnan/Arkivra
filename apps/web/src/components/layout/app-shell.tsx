import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { useMeQuery } from '@/features/me/me.queries';

export function AppShell({ children }: PropsWithChildren) {
  const meQuery = useMeQuery();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Arkivra</p>
            <h1 className="font-serif text-3xl tracking-tight">Your document workspace</h1>
            <nav className="flex flex-wrap gap-3 text-sm">
              <NavLink to="/vaults" className={({ isActive }) => isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                Vaults
              </NavLink>
              <NavLink to="/search" className={({ isActive }) => isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                Search
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                Settings
              </NavLink>
              {meQuery.data?.isGlobalAdmin ? (
                <NavLink to="/admin" className={({ isActive }) => isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                  Admin
                </NavLink>
              ) : null}
              <NavLink to="/about" className={({ isActive }) => isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}>
                About
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

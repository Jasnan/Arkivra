import type { PropsWithChildren } from 'react';
import { Bell, Command as CommandIcon, Search } from 'lucide-react';
import { CommandMenu } from '@/components/navigation/command-menu';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navigationItems = [
  'Dashboard',
  'Vaults',
  'Documents',
  'Search',
  'Tags',
  'Admin',
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.35))] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-20 mb-6 rounded-3xl border border-border/70 bg-background/80 px-4 py-4 shadow-lg shadow-black/5 backdrop-blur xl:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <span className="text-sm font-semibold tracking-[0.28em]">AK</span>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Arkivra</p>
                <h1 className="font-serif text-2xl tracking-tight">Frontend foundation</h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                className="justify-between gap-3 border-dashed text-muted-foreground sm:min-w-72"
                type="button"
                onClick={() => window.dispatchEvent(new Event('arkivra:command-menu.open'))}
              >
                <span className="inline-flex items-center gap-2">
                  <Search className="size-4" />
                  Quick actions
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                  <CommandIcon className="size-3" />
                  K
                </span>
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" type="button" aria-label="Notifications">
                  <Bell className="size-4" />
                </Button>
                <ThemeToggle />
              </div>
            </div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2">
            {navigationItems.map(item => (
              <span
                key={item}
                className={cn(
                  'rounded-full border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors',
                  item === 'Dashboard' && 'border-border bg-muted text-foreground',
                )}
              >
                {item}
              </span>
            ))}
          </nav>
        </header>

        <main className="flex-1">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}

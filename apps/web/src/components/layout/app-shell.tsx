import type { PropsWithChildren } from 'react';
import { Command as CommandIcon } from 'lucide-react';
import { CommandMenu } from '@/components/navigation/command-menu';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { Button } from '@/components/ui/button';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Arkivra</p>
            <h1 className="font-serif text-3xl tracking-tight">Frontend scaffold</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              type="button"
              onClick={() => window.dispatchEvent(new Event('arkivra:command-menu.open'))}
            >
              <CommandIcon className="size-4" />
              Command menu
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}

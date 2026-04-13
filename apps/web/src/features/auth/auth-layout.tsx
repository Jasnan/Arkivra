import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/navigation/theme-toggle';

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 sm:px-6">
        <header className="mb-10 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Arkivra
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center">{children}</main>
      </div>
    </div>
  );
}

export function AuthCard({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-6 space-y-4">{children}</div>
    </section>
  );
}

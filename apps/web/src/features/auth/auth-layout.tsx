import type { PropsWithChildren, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 sm:px-6">
        <header className="mb-10 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            Arkivra
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center">{children}</main>
      </div>
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle>{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function AuthActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border/70 pt-4 text-sm">
      {children}
    </div>
  );
}

import { useHealthQuery } from '@/features/system/queries';

export function DashboardPage() {
  const healthQuery = useHealthQuery();

  return (
    <section className="space-y-6 pb-8">
      <div className="space-y-3">
        <h2 className="font-serif text-4xl tracking-tight">Phase 3a core scaffold</h2>
        <p className="max-w-2xl text-base text-muted-foreground">
          This branch now focuses on the required frontend foundation only: routing, theme, auth client wiring,
          React Query, toast support, command palette setup, and frontend testing.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Included now</h3>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>React Router application shell</li>
          <li>Tailwind CSS v4 and shadcn-style theme tokens</li>
          <li>Better Auth React client bootstrap</li>
          <li>TanStack React Query provider</li>
          <li>Sonner toaster and cmdk command menu scaffold</li>
          <li>Vitest plus Testing Library setup</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">API heartbeat</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Basic query wiring is in place so upcoming pages can connect to the backend without reworking app setup.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt>
            <dd className="mt-2 text-lg font-semibold">{healthQuery.isLoading ? 'Checking' : healthQuery.data?.status ?? 'Offline'}</dd>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Version</dt>
            <dd className="mt-2 text-sm font-medium">{healthQuery.data?.version ?? 'Unavailable'}</dd>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Timestamp</dt>
            <dd className="mt-2 text-sm font-medium">{healthQuery.data?.timestamp ?? 'Unavailable'}</dd>
          </div>
        </dl>
        {healthQuery.isError ? (
          <p className="mt-4 text-sm text-destructive">
            The API is not reachable right now. The scaffold still stands, and the hook will work once the backend is running.
          </p>
        ) : null}
      </div>
    </section>
  );
}

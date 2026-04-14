import { useQuery } from '@tanstack/react-query';
import { getHealth } from '@/lib/api';

export function AboutPage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  return (
    <section className="space-y-6 pb-8">
      <div>
        <h2 className="font-serif text-4xl tracking-tight">About</h2>
        <p className="text-sm text-muted-foreground">Arkivra is a self-hosted, AI-ready document management system built for private control and future search workflows.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Instance</h3>
          {healthQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading version info…</p> : null}
          {healthQuery.isError ? <p className="mt-4 text-sm text-destructive">Unable to load instance metadata.</p> : null}
          {healthQuery.data ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">{healthQuery.data.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Version</dt>
                <dd className="font-medium">{healthQuery.data.version}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reported at</dt>
                <dd className="font-medium">{new Date(healthQuery.data.timestamp).toLocaleString()}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Project</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>Self-hosted first: documents stay on infrastructure you control.</li>
            <li>Search-ready foundation: keyword search is live today, with semantic workflows planned for later phases.</li>
            <li>Open source under AGPL-3.0-or-later.</li>
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://github.com/Jasnan/Arkivra"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              GitHub repository
            </a>
            <a
              href="https://github.com/Jasnan/Arkivra/blob/main/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              README
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

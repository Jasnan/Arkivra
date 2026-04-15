import { useQuery } from '@tanstack/react-query';
import { BookOpen, LockKeyhole, SearchCheck } from 'lucide-react';
import { PageIntro, StatCard, SurfacePanel } from '@/components/layout/vault-ui';
import { getHealth } from '@/lib/api';

export function AboutPage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Platform Overview"
        title="About Arkivra"
        description="Arkivra is a self-hosted, AI-ready document management system built for private control, structured search, and a durable vault model."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Hosting model"
          value="Self-hosted"
          meta="Documents stay on infrastructure you control."
          icon={<LockKeyhole className="size-5" />}
        />
        <StatCard
          label="Search posture"
          value="Keyword live"
          meta="Semantic and chat workflows can layer in later phases."
          icon={<SearchCheck className="size-5" />}
        />
        <StatCard
          label="License"
          value="AGPL-3.0"
          meta="Open source by default."
          icon={<BookOpen className="size-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SurfacePanel className="space-y-5">
          <div>
            <p className="vault-label">Instance</p>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Runtime status</h2>
          </div>

          {healthQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading version info...</p> : null}
          {healthQuery.isError ? <p className="text-sm text-destructive">Unable to load instance metadata.</p> : null}
          {healthQuery.data ? (
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium text-foreground">{healthQuery.data.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Version</dt>
                <dd className="font-medium text-foreground">{healthQuery.data.version}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reported at</dt>
                <dd className="font-medium text-foreground">{new Date(healthQuery.data.timestamp).toLocaleString()}</dd>
              </div>
            </dl>
          ) : null}
        </SurfacePanel>

        <SurfacePanel variant="soft" className="space-y-5">
          <div>
            <p className="vault-label">Project</p>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Core direction</h2>
          </div>

          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Self-hosted first, so the installation runs on infrastructure you control.</p>
            <p>Vault-based organization with explicit ownership, membership, and permissions.</p>
            <p>Keyword search is live today, with semantic workflows planned for future phases.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/Jasnan/Arkivra"
              target="_blank"
              rel="noreferrer"
              className="vault-link"
            >
              GitHub repository
            </a>
            <a
              href="https://github.com/Jasnan/Arkivra/blob/main/README.md"
              target="_blank"
              rel="noreferrer"
              className="vault-link"
            >
              README
            </a>
          </div>
        </SurfacePanel>
      </div>
    </section>
  );
}

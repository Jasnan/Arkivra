import { CheckCircle2, DatabaseZap, LockKeyhole, Router, TestTube2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHealthQuery } from '@/features/system/queries';

const checklist = [
  {
    title: 'Routing and SPA shell',
    description: 'React Router and a reusable application frame are ready for auth, vault, and admin flows.',
    icon: Router,
  },
  {
    title: 'Design system foundations',
    description: 'Tailwind CSS v4 tokens, dark mode, and shadcn-style component patterns are in place.',
    icon: CheckCircle2,
  },
  {
    title: 'API-ready data layer',
    description: 'TanStack React Query is configured for cache-aware API hooks and optimistic UI patterns.',
    icon: DatabaseZap,
  },
  {
    title: 'Authentication integration point',
    description: 'The Better Auth React client is initialized so Phase 3b can add real sign-in flows cleanly.',
    icon: LockKeyhole,
  },
  {
    title: 'Testing harness',
    description: 'Vitest, jsdom, and Testing Library are scaffolded for component and route-level coverage.',
    icon: TestTube2,
  },
];

export function DashboardPage() {
  const healthQuery = useHealthQuery();

  return (
    <section className="space-y-6 pb-8">
      <Card className="overflow-hidden border-none bg-transparent shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="max-w-3xl font-serif text-4xl tracking-tight sm:text-5xl">
            Arkivra is ready for Phase 3 feature work.
          </CardTitle>
          <CardDescription className="max-w-2xl text-base text-muted-foreground">
            This scaffold replaces the placeholder app with the shared frontend foundations we&apos;ll use for
            authentication, vault management, document workflows, search, and administration.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="border-border/60 bg-card/85 backdrop-blur">
          <CardHeader>
            <CardTitle>Scaffold checklist</CardTitle>
            <CardDescription>Phase 3a targets from the project plan now represented in the app shell.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {checklist.map(item => {
              const Icon = item.icon;

              return (
                <div key={item.title} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/92">
          <CardHeader>
            <CardTitle>API heartbeat</CardTitle>
            <CardDescription>A simple React Query hook confirms the frontend can start talking to the backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="mt-2 text-2xl font-semibold capitalize">
                {healthQuery.isLoading ? 'Checking' : healthQuery.data?.status ?? 'Offline'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="mt-2 font-medium">{healthQuery.data?.version ?? 'Unavailable'}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Timestamp</p>
                <p className="mt-2 text-sm font-medium">{healthQuery.data?.timestamp ?? 'Unavailable'}</p>
              </div>
            </div>
            {healthQuery.isError ? (
              <p className="text-sm text-destructive">
                The API is not reachable yet. That is fine for the scaffold, and the hook is ready once the backend is running.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

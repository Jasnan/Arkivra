import type { PropsWithChildren, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const vaultInputClassName = 'vault-input';

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="vault-label">{eyebrow}</p> : null}
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-1.5">
        <p className="vault-label">{eyebrow}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function SurfacePanel({
  className,
  variant = 'default',
  children,
}: PropsWithChildren<{
  className?: string;
  variant?: 'default' | 'soft' | 'strong';
}>) {
  return (
    <div
      className={cn(
        variant === 'default' && 'vault-panel',
        variant === 'soft' && 'vault-panel-soft',
        variant === 'strong' && 'vault-panel-strong',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  meta,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <SurfacePanel className={cn('flex h-full flex-col justify-between gap-3', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="vault-label">{label}</p>
          <div className="font-display text-xl font-semibold text-foreground">{value}</div>
        </div>
        {icon ? (
          <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            {icon}
          </div>
        ) : null}
      </div>
      {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
    </SurfacePanel>
  );
}

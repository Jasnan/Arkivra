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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="vault-label">{eyebrow}</p> : null}
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em] text-foreground sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
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
        <h2 className="font-display text-xl font-bold tracking-[-0.03em] text-foreground">
          {title}
        </h2>
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

export function StatusBanner({
  children,
  tone = 'neutral',
}: PropsWithChildren<{
  tone?: 'neutral' | 'danger';
}>) {
  return (
    <div
      className={cn(
        'rounded-[22px] px-4 py-3 text-sm backdrop-blur-xl',
        tone === 'neutral' && 'bg-card/80 text-muted-foreground shadow-[0_14px_28px_rgba(19,27,46,0.05)]',
        tone === 'danger' && 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
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
    <SurfacePanel className={cn('flex h-full flex-col justify-between gap-4', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="vault-label">{label}</p>
          <div className="font-display text-2xl font-extrabold tracking-[-0.05em] text-foreground">
            {value}
          </div>
        </div>
        {icon ? (
          <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            {icon}
          </div>
        ) : null}
      </div>
      {meta ? <div className="text-sm text-muted-foreground">{meta}</div> : null}
    </SurfacePanel>
  );
}

import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type IconComponent = ComponentType<{ className?: string }>;

export function ActionMenuTriggerButton({
  className,
  label,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'children' | 'size' | 'variant'> & {
  label: string;
  children?: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn(
        'h-9 w-9 rounded-lg border border-border/60 bg-background/80 text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children ?? <MoreHorizontal className="size-4" />}
    </Button>
  );
}

export function ActionMenuItemIcon({
  icon: Icon,
  tone = 'default',
  className,
}: {
  icon: IconComponent;
  tone?: 'default' | 'destructive';
  className?: string;
}) {
  return (
    <Icon
      className={cn(
        'size-4 shrink-0',
        tone === 'destructive' ? 'text-destructive' : 'text-primary',
        className,
      )}
    />
  );
}

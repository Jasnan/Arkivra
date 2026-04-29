import type { ComponentProps, ReactNode } from 'react';
import { ArchiveRestore, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ActionButtonProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  children: ReactNode;
};

export function CreateButton({ children, className, ...props }: ActionButtonProps) {
  return (
    <Button className={className} {...props}>
      <Plus className="size-4" />
      {children}
    </Button>
  );
}

export function SaveButton({ children, className, ...props }: ActionButtonProps) {
  return (
    <Button className={className} {...props}>
      <Save className="size-4" />
      {children}
    </Button>
  );
}

export function RestoreButton({ children, className, ...props }: ActionButtonProps) {
  return (
    <Button className={className} {...props}>
      <RotateCcw className="size-4" />
      {children}
    </Button>
  );
}

export function RestoreArchiveButton({ children, className, ...props }: ActionButtonProps) {
  return (
    <Button className={className} {...props}>
      <ArchiveRestore className="size-4" />
      {children}
    </Button>
  );
}

export function DeleteButton({ children, className, ...props }: ActionButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        'border-destructive/30 text-destructive hover:bg-destructive/8 hover:text-destructive',
        className,
      )}
      {...props}
    >
      <Trash2 className="size-4" />
      {children}
    </Button>
  );
}

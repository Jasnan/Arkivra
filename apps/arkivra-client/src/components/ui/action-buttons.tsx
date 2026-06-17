import { forwardRef } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ArchiveRestore, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ActionButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'ref'> & {
  children: ReactNode;
};

export const CreateButton = forwardRef<HTMLButtonElement, ActionButtonProps>((
  { children, className, size, ...props },
  ref,
) => {
  const iconClassName = size === 'sm' ? 'size-3.5' : 'size-4';

  return (
    <Button ref={ref} className={className} size={size} {...props}>
      <Plus className={iconClassName} />
      {children}
    </Button>
  );
});

CreateButton.displayName = 'CreateButton';

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
      borderColor="fg.error"
      color="fg.error"
      _hover={{ bg: 'bg.error', color: 'fg.error' }}
      className={className}
      {...props}
    >
      <Trash2 className="size-4" />
      {children}
    </Button>
  );
}

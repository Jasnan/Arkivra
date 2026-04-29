import * as React from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Separator } from './separator';

const fieldVariants = cva('flex gap-2', {
  variants: {
    orientation: {
      vertical: 'flex-col',
      horizontal: 'flex-row items-start gap-3',
      responsive: 'flex-col md:flex-row md:items-start md:gap-3',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

export function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return <fieldset className={cn('space-y-4', className)} {...props} />;
}

export function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & {
  variant?: 'legend' | 'label';
}) {
  return (
    <legend
      className={cn(
        variant === 'legend' && 'text-sm font-semibold text-foreground',
        variant === 'label' && 'text-sm font-medium leading-none text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />;
}

export function FieldSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return <Separator className={className} {...props} />;
}

export function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function FieldError({
  className,
  errors,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const messages = errors?.map((error) => error?.message).filter(Boolean);

  if (messages && messages.length > 0) {
    return (
      <div className={cn('text-sm text-destructive', className)} {...props}>
        {messages.length === 1 ? <p>{messages[0]}</p> : <ul className="list-disc pl-5">{messages.map(message => <li key={message}>{message}</li>)}</ul>}
      </div>
    );
  }

  return <div className={cn('text-sm text-destructive', className)} {...props} />;
}

export const Field = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>
>(({ className, orientation, ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    className={cn(fieldVariants({ orientation }), '[&[data-invalid]_*]:text-destructive', className)}
    {...props}
  />
));

Field.displayName = 'Field';

export const FieldLabel = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  ),
);

FieldLabel.displayName = 'FieldLabel';

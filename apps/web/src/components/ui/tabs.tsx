import * as React from 'react';
import { Tabs as ChakraTabs } from '@chakra-ui/react';
import { cn } from '@/lib/utils';

type TabsProps = Omit<
  React.ComponentProps<typeof ChakraTabs.Root>,
  'onValueChange'
> & {
  onValueChange?: (value: string) => void;
};

export function Tabs({ onValueChange, unmountOnExit = true, ...props }: TabsProps) {
  return (
    <ChakraTabs.Root
      onValueChange={onValueChange ? (event) => onValueChange(event.value) : undefined}
      unmountOnExit={unmountOnExit}
      {...props}
    />
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof ChakraTabs.List>) {
  return (
    <ChakraTabs.List
      className={cn(
        'inline-flex h-auto items-center rounded-lg bg-secondary/70 p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof ChakraTabs.Trigger>) {
  return (
    <ChakraTabs.Trigger
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof ChakraTabs.Content>) {
  return (
    <ChakraTabs.Content
      className={cn('mt-0 outline-none', className)}
      {...props}
    />
  );
}

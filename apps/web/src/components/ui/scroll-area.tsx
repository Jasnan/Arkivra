import * as React from 'react';
import { ScrollArea as ChakraScrollArea } from '@chakra-ui/react';
import { cn } from '@/lib/utils';

export function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ChakraScrollArea.Root>) {
  return (
    <ChakraScrollArea.Root className={cn('relative overflow-hidden', className)} {...props}>
      <ChakraScrollArea.Viewport className="h-full w-full rounded-[inherit]">
        <ChakraScrollArea.Content>{children}</ChakraScrollArea.Content>
      </ChakraScrollArea.Viewport>
      <ScrollBar />
      <ChakraScrollArea.Corner />
    </ChakraScrollArea.Root>
  );
}

export function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ChakraScrollArea.Scrollbar>) {
  return (
    <ChakraScrollArea.Scrollbar
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-0.5 transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ChakraScrollArea.Thumb className="relative flex-1 rounded-full bg-border/80" />
    </ChakraScrollArea.Scrollbar>
  );
}

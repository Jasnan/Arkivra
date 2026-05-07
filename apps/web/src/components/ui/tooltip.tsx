import * as React from 'react';
import { Portal, Tooltip as ChakraTooltip } from '@chakra-ui/react';

interface TooltipProviderProps {
  children?: React.ReactNode;
  delayDuration?: number;
}

export function TooltipProvider({ children, delayDuration = 100 }: TooltipProviderProps) {
  return (
    <ChakraTooltip.PropsProvider value={{ openDelay: delayDuration }}>
      {children}
    </ChakraTooltip.PropsProvider>
  );
}

export function Tooltip(props: React.ComponentProps<typeof ChakraTooltip.Root>) {
  return <ChakraTooltip.Root {...props} />;
}

export function TooltipTrigger(props: React.ComponentProps<typeof ChakraTooltip.Trigger>) {
  return <ChakraTooltip.Trigger {...props} />;
}

type TooltipContentProps = React.ComponentProps<typeof ChakraTooltip.Content> & {
  ref?: React.Ref<HTMLDivElement>;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  align?: string;
};

export function TooltipContent({
  ref,
  side: _side = 'top',
  sideOffset: _sideOffset = 6,
  align: _align,
  ...props
}: TooltipContentProps) {
  return (
    <Portal>
      <ChakraTooltip.Positioner>
        <ChakraTooltip.Content
          ref={ref}
          maxW="64"
          borderWidth="1px"
          borderColor="border.subtle"
          bg="surface.raised"
          color="text.muted"
          px="3"
          py="2"
          textStyle="xs"
          shadow="lg"
          {...props}
        />
      </ChakraTooltip.Positioner>
    </Portal>
  );
}

TooltipContent.displayName = 'TooltipContent';

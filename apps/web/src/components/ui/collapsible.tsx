import * as React from 'react';
import { Collapsible as ChakraCollapsible } from '@chakra-ui/react';

type CollapsibleProps = Omit<
  React.ComponentProps<typeof ChakraCollapsible.Root>,
  'onOpenChange'
> & {
  onOpenChange?: (open: boolean) => void;
};

export function Collapsible({
  lazyMount = true,
  onOpenChange,
  unmountOnExit = true,
  ...props
}: CollapsibleProps) {
  return (
    <ChakraCollapsible.Root
      lazyMount={lazyMount}
      onOpenChange={onOpenChange ? (event) => onOpenChange(event.open) : undefined}
      unmountOnExit={unmountOnExit}
      {...props}
    />
  );
}

export const CollapsibleTrigger = ChakraCollapsible.Trigger;

export const CollapsibleContent = ChakraCollapsible.Content;

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

export function CollapsibleTrigger(props: React.ComponentProps<typeof ChakraCollapsible.Trigger>) {
  return <ChakraCollapsible.Trigger {...props} />;
}

export function CollapsibleContent(props: React.ComponentProps<typeof ChakraCollapsible.Content>) {
  return <ChakraCollapsible.Content {...props} />;
}

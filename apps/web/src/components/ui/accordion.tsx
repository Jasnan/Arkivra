import * as React from 'react';
import { Accordion as ChakraAccordion } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';

type AccordionProps = Omit<React.ComponentProps<typeof ChakraAccordion.Root>, 'onValueChange' | 'value'> & {
  type?: 'single' | 'multiple';
  value?: string;
  onValueChange?: (value: string) => void;
};

export function Accordion({
  type = 'single',
  value,
  onValueChange,
  multiple,
  ...props
}: AccordionProps) {
  return (
    <ChakraAccordion.Root
      multiple={multiple ?? type === 'multiple'}
      value={value ? [value] : []}
      onValueChange={
        onValueChange ? (event) => onValueChange(event.value[0] ?? '') : undefined
      }
      {...props}
    />
  );
}

export function AccordionItem(props: React.ComponentProps<typeof ChakraAccordion.Item>) {
  return <ChakraAccordion.Item borderColor="border.subtle" {...props} />;
}

export function AccordionTrigger({
  children,
  ...props
}: React.ComponentProps<typeof ChakraAccordion.ItemTrigger>) {
  return (
    <ChakraAccordion.ItemTrigger {...props}>
      {children}
      <ChakraAccordion.ItemIndicator ms="auto">
        <ChevronDown className="size-4" />
      </ChakraAccordion.ItemIndicator>
    </ChakraAccordion.ItemTrigger>
  );
}

export function AccordionContent({
  children,
  ...props
}: React.ComponentProps<typeof ChakraAccordion.ItemContent>) {
  return (
    <ChakraAccordion.ItemContent {...props}>
      <ChakraAccordion.ItemBody>{children}</ChakraAccordion.ItemBody>
    </ChakraAccordion.ItemContent>
  );
}

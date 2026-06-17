import * as React from 'react';
import { Checkbox as ChakraCheckbox } from '@chakra-ui/react';

type CheckboxProps = Omit<React.ComponentProps<typeof ChakraCheckbox.Root>, 'onCheckedChange'> & {
  ref?: React.Ref<HTMLLabelElement>;
  onCheckedChange?: (checked: boolean) => void;
};

export function Checkbox({ ref, onCheckedChange, children, ...props }: CheckboxProps) {
  return (
    <ChakraCheckbox.Root
      ref={ref}
      onCheckedChange={onCheckedChange ? (event) => onCheckedChange(event.checked === true) : undefined}
      {...props}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control>
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
      {children ? <ChakraCheckbox.Label>{children}</ChakraCheckbox.Label> : null}
    </ChakraCheckbox.Root>
  );
}

Checkbox.displayName = 'Checkbox';

import * as React from 'react';
import { Switch as ChakraSwitch } from '@chakra-ui/react';

type SwitchProps = Omit<React.ComponentProps<typeof ChakraSwitch.Root>, 'onCheckedChange'> & {
  ref?: React.Ref<HTMLLabelElement>;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ ref, onCheckedChange, children, ...props }: SwitchProps) {
  return (
    <ChakraSwitch.Root
      ref={ref}
      onCheckedChange={onCheckedChange ? (event) => onCheckedChange(event.checked) : undefined}
      {...props}
    >
      <ChakraSwitch.HiddenInput />
      <ChakraSwitch.Control>
        <ChakraSwitch.Thumb />
      </ChakraSwitch.Control>
      {children ? <ChakraSwitch.Label>{children}</ChakraSwitch.Label> : null}
    </ChakraSwitch.Root>
  );
}

Switch.displayName = 'Switch';

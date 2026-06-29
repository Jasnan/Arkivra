import * as React from 'react';
import { Input as ChakraInput } from '@chakra-ui/react';

type InputProps = React.ComponentProps<typeof ChakraInput> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({
  ref,
  type = 'text',
  variant = 'outline',
  ...props
}: InputProps) {
  return (
    <ChakraInput
      ref={ref}
      type={type}
      variant={variant}
      bg="bg.surface"
      borderColor="border.strong"
      _hover={{ borderColor: 'fg/30' }}
      _focusVisible={{
        borderColor: 'teal.solid',
        outline: '2px solid',
        outlineColor: 'teal.focusRing',
        outlineOffset: '1px',
      }}
      _placeholder={{ color: 'fg.subtle' }}
      {...props}
    />
  );
}

Input.displayName = 'Input';

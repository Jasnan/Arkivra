import * as React from 'react';
import { Input as ChakraInput } from '@chakra-ui/react';

type InputProps = React.ComponentProps<typeof ChakraInput> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({ ref, type = 'text', variant = 'outline', ...props }: InputProps) {
  return <ChakraInput ref={ref} type={type} variant={variant} {...props} />;
}

Input.displayName = 'Input';

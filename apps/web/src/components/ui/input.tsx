import * as React from 'react';
import { Input as ChakraInput } from '@chakra-ui/react';

type InputProps = React.ComponentProps<typeof ChakraInput> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({
  h,
  minH,
  px,
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
      h={h ?? 'var(--arkivra-controlHeight, 2.5rem)'}
      minH={minH ?? 'var(--arkivra-controlHeight, 2.5rem)'}
      px={px ?? 'var(--arkivra-controlPaddingX, 0.75rem)'}
      {...props}
    />
  );
}

Input.displayName = 'Input';

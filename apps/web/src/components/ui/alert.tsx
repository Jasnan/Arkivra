import * as React from 'react';
import { Alert as ChakraAlert } from '@chakra-ui/react';

type AlertProps = React.ComponentProps<typeof ChakraAlert.Root> & {
  ref?: React.Ref<HTMLDivElement>;
  variant?: 'default' | 'destructive';
};

export function Alert({ colorPalette, variant = 'default', ref, ...props }: AlertProps) {
  return (
    <ChakraAlert.Root
      ref={ref}
      role="alert"
      colorPalette={colorPalette ?? (variant === 'destructive' ? 'red' : 'blue')}
      variant="subtle"
      borderWidth="1px"
      borderColor={variant === 'destructive' ? 'status.danger' : 'border.subtle'}
      {...props}
    />
  );
}

Alert.displayName = 'Alert';

export function AlertTitle(props: React.ComponentProps<typeof ChakraAlert.Title>) {
  return <ChakraAlert.Title {...props} />;
}

export function AlertDescription(props: React.ComponentProps<typeof ChakraAlert.Description>) {
  return <ChakraAlert.Description {...props} />;
}

import * as React from 'react';
import { Textarea as ChakraTextarea } from '@chakra-ui/react';

type TextareaProps = React.ComponentProps<typeof ChakraTextarea> & {
  ref?: React.Ref<HTMLTextAreaElement>;
};

export function Textarea({ ref, variant = 'outline', ...props }: TextareaProps) {
  return <ChakraTextarea ref={ref} variant={variant} {...props} />;
}

Textarea.displayName = 'Textarea';

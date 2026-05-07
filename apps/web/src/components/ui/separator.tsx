import * as React from 'react';
import { Separator as ChakraSeparator } from '@chakra-ui/react';

type SeparatorProps = React.ComponentProps<typeof ChakraSeparator> & {
  ref?: React.Ref<HTMLSpanElement>;
  decorative?: boolean;
};

export function Separator({
  orientation = 'horizontal',
  decorative: _decorative = true,
  ref,
  ...props
}: SeparatorProps) {
  return (
    <ChakraSeparator
      ref={ref}
      orientation={orientation}
      borderColor="border.subtle"
      {...props}
    />
  );
}

Separator.displayName = 'Separator';

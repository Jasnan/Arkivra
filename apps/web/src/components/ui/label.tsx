import * as React from 'react';
import { chakra } from '@chakra-ui/react';

type LabelProps = React.ComponentProps<typeof chakra.label> & {
  ref?: React.Ref<HTMLLabelElement>;
};

export function Label({ ref, ...props }: LabelProps) {
  return (
    <chakra.label
      ref={ref}
      fontSize="sm"
      fontWeight="medium"
      lineHeight="none"
      color="text.default"
      {...props}
    />
  );
}

Label.displayName = 'Label';

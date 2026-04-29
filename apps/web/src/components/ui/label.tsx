import * as React from 'react';
import { cn } from '@/lib/utils';

type LabelProps = React.ComponentProps<'label'> & {
  ref?: React.Ref<HTMLLabelElement>;
};

export function Label({ className, ref, ...props }: LabelProps) {
  return <label ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

Label.displayName = 'Label';

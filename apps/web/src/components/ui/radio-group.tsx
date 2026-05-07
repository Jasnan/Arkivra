import * as React from 'react';
import { chakra } from '@chakra-ui/react';
import { cn } from '@/lib/utils';

interface RadioGroupContextValue {
  name?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

type RadioGroupProps = React.ComponentPropsWithRef<typeof chakra.div> & {
  defaultValue?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

export function RadioGroup({
  className,
  defaultValue,
  name,
  onValueChange,
  ref,
  value: valueProp,
  ...props
}: RadioGroupProps) {
  const [valueState, setValueState] = React.useState(defaultValue ?? '');
  const value = valueProp ?? valueState;

  const context = React.useMemo<RadioGroupContextValue>(
    () => ({
      name,
      value,
      onValueChange: (nextValue) => {
        if (valueProp === undefined) {
          setValueState(nextValue);
        }
        onValueChange?.(nextValue);
      },
    }),
    [name, onValueChange, value, valueProp],
  );

  return (
    <RadioGroupContext value={context}>
      <chakra.div
        ref={ref}
        role="radiogroup"
        className={cn('grid gap-2', className)}
        {...props}
      />
    </RadioGroupContext>
  );
}

type RadioGroupItemProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type'
> & {
  ref?: React.Ref<HTMLInputElement>;
  value: string;
};

export function RadioGroupItem({ className, name, ref, value, ...props }: RadioGroupItemProps) {
  const context = React.useContext(RadioGroupContext);
  const checked = context?.value === value;

  return (
    <span
      className={cn(
        'relative inline-flex aspect-square h-4 w-4 shrink-0 items-center justify-center rounded-full border border-input bg-background text-primary shadow-xs outline-none transition focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-2 has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className,
      )}
    >
      <input
        ref={ref}
        type="radio"
        name={name ?? context?.name}
        value={value}
        checked={checked}
        className="absolute inset-0 m-0 cursor-pointer opacity-0"
        onChange={() => context?.onValueChange?.(value)}
        {...props}
      />
      {checked ? <span className="size-2 rounded-full bg-current" /> : null}
    </span>
  );
}

import type { ComponentProps } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import type { RadioDropdownMenuOption } from '@/components/ui/radio-dropdown-menu';

export type DocumentSortOption<TValue extends string> = RadioDropdownMenuOption<TValue>;

export function DocumentSortMenu<TValue extends string>({
  ariaLabel,
  buttonProps,
  hideLabel = false,
  iconOnlyOnMobile = false,
  labelId,
  onValueChange,
  options,
  value,
  variant = 'default',
}: {
  ariaLabel: string;
  buttonProps?: ComponentProps<typeof Button>;
  hideLabel?: boolean;
  iconOnlyOnMobile?: boolean;
  labelId?: string;
  onValueChange: (value: TValue) => void;
  options: Array<DocumentSortOption<TValue>>;
  value: TValue;
  variant?: 'default' | 'toolbar' | 'input';
}) {
  return (
    <RadioDropdownMenu
      ariaLabel={ariaLabel}
      buttonProps={buttonProps}
      hideLabel={hideLabel}
      icon={<ArrowUpDown size={16} />}
      iconOnlyOnMobile={iconOnlyOnMobile}
      labelId={labelId}
      onValueChange={onValueChange}
      options={options}
      placeholder="Sort"
      value={value}
      variant={variant}
    />
  );
}

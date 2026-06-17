import { ArrowUpDown } from 'lucide-react';
import type { ButtonProps } from '@/components/ui/button';
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
  size = 'md',
  value,
  variant = 'default',
}: {
  ariaLabel: string;
  buttonProps?: ButtonProps;
  hideLabel?: boolean;
  iconOnlyOnMobile?: boolean;
  labelId?: string;
  onValueChange: (value: TValue) => void;
  options: Array<DocumentSortOption<TValue>>;
  size?: 'sm' | 'md';
  value: TValue;
  variant?: 'default' | 'toolbar' | 'input';
}) {
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <RadioDropdownMenu
      ariaLabel={ariaLabel}
      buttonProps={buttonProps}
      hideLabel={hideLabel}
      icon={<ArrowUpDown size={iconSize} />}
      iconOnlyOnMobile={iconOnlyOnMobile}
      labelId={labelId}
      onValueChange={onValueChange}
      options={options}
      placeholder="Sort"
      size={size}
      triggerLabel={variant === 'input' ? 'Sort' : undefined}
      value={value}
      variant={variant}
    />
  );
}

import * as React from 'react';
import { Button as ChakraButton } from '@chakra-ui/react';
import { cn } from '@/lib/utils';

type LegacyButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost';
type LegacyButtonSize = 'default' | 'sm' | 'lg' | 'icon';
type ChakraButtonProps = React.ComponentProps<typeof ChakraButton>;

const variantMap: Record<LegacyButtonVariant, ChakraButtonProps['variant']> = {
  default: 'solid',
  outline: 'outline',
  secondary: 'subtle',
  ghost: 'ghost',
};

const sizeMap: Record<LegacyButtonSize, ChakraButtonProps['size']> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
};

export interface ButtonProps
  extends Omit<ChakraButtonProps, 'size' | 'variant'> {
  ref?: React.Ref<HTMLButtonElement>;
  size?: LegacyButtonSize | ChakraButtonProps['size'];
  variant?: LegacyButtonVariant | ChakraButtonProps['variant'];
}

function normalizeVariant(variant: ButtonProps['variant']) {
  return typeof variant === 'string' && variant in variantMap
    ? variantMap[variant as LegacyButtonVariant]
    : (variant as ChakraButtonProps['variant']) ?? 'solid';
}

function normalizeSize(size: ButtonProps['size']) {
  return typeof size === 'string' && size in sizeMap
    ? sizeMap[size as LegacyButtonSize]
    : (size as ChakraButtonProps['size']) ?? 'md';
}

export function Button({
  className,
  colorPalette,
  size = 'default',
  variant = 'default',
  ref,
  ...props
}: ButtonProps) {
  return (
    <ChakraButton
      ref={ref}
      colorPalette={colorPalette ?? (variant === 'default' ? 'teal' : 'gray')}
      size={normalizeSize(size)}
      variant={normalizeVariant(variant)}
      className={cn(size === 'icon' && 'h-10 w-10 px-0', className)}
      {...props}
    />
  );
}

Button.displayName = 'Button';

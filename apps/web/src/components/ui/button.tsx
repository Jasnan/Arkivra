import * as React from 'react';
import { Button as ChakraButton } from '@chakra-ui/react';

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
  h,
  minH,
  px,
  w,
  ...props
}: ButtonProps) {
  const normalizedSize = normalizeSize(size);
  const densityHeight = normalizedSize === 'sm'
    ? 'calc(var(--arkivra-controlHeight, 2.5rem) - 0.25rem)'
    : normalizedSize === 'lg'
      ? 'calc(var(--arkivra-controlHeight, 2.5rem) + 0.25rem)'
      : normalizedSize === 'md'
        ? 'var(--arkivra-controlHeight, 2.5rem)'
        : undefined;
  const isIconButton = size === 'icon';
  const densityPaddingX = normalizedSize === 'sm'
    ? 'calc(var(--arkivra-controlPaddingX, 0.75rem) * 0.85)'
    : normalizedSize === 'lg'
      ? 'calc(var(--arkivra-controlPaddingX, 0.75rem) * 1.25)'
      : normalizedSize === 'md'
        ? 'var(--arkivra-controlPaddingX, 0.75rem)'
        : undefined;

  return (
    <ChakraButton
      ref={ref}
      colorPalette={colorPalette ?? (variant === 'default' ? 'teal' : 'gray')}
      size={normalizedSize}
      variant={normalizeVariant(variant)}
      h={h ?? densityHeight}
      minH={minH ?? densityHeight}
      px={px ?? (isIconButton ? '0' : densityPaddingX)}
      w={w ?? (isIconButton ? densityHeight : undefined)}
      className={className}
      {...props}
    />
  );
}

Button.displayName = 'Button';

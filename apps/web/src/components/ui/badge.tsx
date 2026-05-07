import * as React from 'react';
import { Badge as ChakraBadge } from '@chakra-ui/react';

type LegacyBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';
type ChakraBadgeProps = React.ComponentProps<typeof ChakraBadge>;

const variantMap: Record<LegacyBadgeVariant, ChakraBadgeProps['variant']> = {
  default: 'solid',
  secondary: 'subtle',
  outline: 'outline',
  destructive: 'solid',
};

export interface BadgeProps
  extends Omit<ChakraBadgeProps, 'variant'> {
  variant?: LegacyBadgeVariant | ChakraBadgeProps['variant'];
}

function normalizeVariant(variant: BadgeProps['variant']) {
  return typeof variant === 'string' && variant in variantMap
    ? variantMap[variant as LegacyBadgeVariant]
    : (variant as ChakraBadgeProps['variant']) ?? 'solid';
}

export function Badge({ colorPalette, variant = 'default', ...props }: BadgeProps) {
  return (
    <ChakraBadge
      colorPalette={colorPalette ?? (variant === 'destructive' ? 'red' : variant === 'default' ? 'blue' : 'gray')}
      variant={normalizeVariant(variant)}
      {...props}
    />
  );
}

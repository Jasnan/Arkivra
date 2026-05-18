import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { Icon as ChakraIcon } from '@chakra-ui/react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

type IconComponent = ComponentType<{ className?: string }>;

export function ActionMenuTriggerButton({
  className,
  label,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'children' | 'size' | 'variant'> & {
  label: string;
  children?: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      h="calc(var(--arkivra-controlHeight, 2.5rem) - 0.25rem)"
      w="calc(var(--arkivra-controlHeight, 2.5rem) - 0.25rem)"
      rounded="lg"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      color="fg.muted"
      _hover={{ bg: 'bg.subtle', color: 'fg' }}
      className={className}
      {...props}
    >
      {children ?? <MoreHorizontal className="size-4" />}
    </Button>
  );
}

export function ActionMenuItemIcon({
  icon: MenuIcon,
  tone = 'default',
  className,
}: {
  icon: IconComponent;
  tone?: 'default' | 'destructive';
  className?: string;
}) {
  return (
    <ChakraIcon
      as={MenuIcon}
      boxSize="4"
      flexShrink="0"
      color={tone === 'destructive' ? 'fg.error' : 'teal.solid'}
      className={className}
    />
  );
}

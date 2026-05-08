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
      h="9"
      w="9"
      rounded="lg"
      borderWidth="1px"
      borderColor="border.subtle"
      bg="bg.panel"
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

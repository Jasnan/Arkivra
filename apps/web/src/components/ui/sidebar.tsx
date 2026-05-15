import type { ComponentProps } from 'react';
import * as React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarContext, useSidebar } from '@/components/ui/sidebar-context';
import { TooltipProvider } from '@/components/ui/tooltip';

type SidebarProviderProps = ComponentProps<typeof Box> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SidebarProvider({
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  ...props
}: SidebarProviderProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [onOpenChange, openProp],
  );

  const toggleSidebar = React.useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggleSidebar,
    }),
    [open, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext value={value}>
      <TooltipProvider delayDuration={0}>
        <Box
          data-slot="sidebar-wrapper"
          data-state={open ? 'expanded' : 'collapsed'}
          display="flex"
          minH="100vh"
          w="full"
          {...props}
        >
          {children}
        </Box>
      </TooltipProvider>
    </SidebarContext>
  );
}

type SidebarProps = ComponentProps<typeof Box> & {
  collapsible?: 'icon' | 'offcanvas' | 'none';
  variant?: 'default' | 'inset';
};

export function Sidebar({
  children,
  collapsible = 'icon',
  variant = 'default',
  ...props
}: SidebarProps) {
  const { open } = useSidebar();
  const isCollapsed = collapsible === 'icon' && !open;
  const isOffcanvas = collapsible === 'offcanvas' && !open;

  return (
    <Box
      as="aside"
      data-slot="sidebar"
      data-state={open ? 'expanded' : 'collapsed'}
      data-collapsible={isCollapsed ? 'icon' : isOffcanvas ? 'offcanvas' : ''}
      aria-hidden={isOffcanvas ? true : undefined}
      display="block"
      position="sticky"
      top="0"
      flexShrink={0}
      color="fg"
      h="100vh"
      p={variant === 'inset' ? '2' : undefined}
      w={
        isCollapsed
          ? 'var(--sidebar-width-icon)'
          : isOffcanvas
            ? '0'
            : 'var(--sidebar-width)'
      }
      opacity={isOffcanvas ? 0 : undefined}
      transition="width 200ms ease-linear"
      {...props}
    >
      <Flex
        position="relative"
        direction="column"
        h="full"
        bg={variant === 'inset' ? 'transparent' : 'bg.surface'}
        borderRightWidth={variant === 'inset' ? undefined : '1px'}
        borderColor="border.subtle"
        pointerEvents={isOffcanvas ? 'none' : undefined}
        overflow={isOffcanvas ? 'hidden' : undefined}
        opacity={isOffcanvas ? 0 : undefined}
      >
        {children}
      </Flex>
    </Box>
  );
}

type SidebarTriggerProps = Omit<React.ComponentProps<typeof Button>, 'aria-label' | 'title'>;

export function SidebarTrigger({ onClick, ...props }: SidebarTriggerProps) {
  const { open, toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          toggleSidebar();
        }
      }}
      {...props}
    >
      {open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
    </Button>
  );
}

type SidebarRailProps = ComponentProps<typeof Box>;

export function SidebarRail(props: SidebarRailProps) {
  return (
    <Box
      aria-hidden="true"
      position="absolute"
      top="3"
      bottom="3"
      right="0"
      display={{ base: 'none', lg: 'block' }}
      w="1px"
      transform="translateX(50%)"
      borderRadius="full"
      bg="border.subtle"
      pointerEvents="none"
      {...props}
    />
  );
}

type SidebarInsetProps = ComponentProps<typeof Flex>;

export function SidebarInset({ children, ...props }: SidebarInsetProps) {
  return (
    <Flex
      data-slot="sidebar-inset"
      minW="0"
      flex="1"
      direction="column"
      {...props}
    >
      {children}
    </Flex>
  );
}

type SidebarSectionProps = ComponentProps<typeof Flex>;

export function SidebarHeader({ children, ...props }: SidebarSectionProps) {
  return (
    <Flex data-slot="sidebar-header" direction="column" {...props}>
      {children}
    </Flex>
  );
}

export function SidebarContent({ children, ...props }: SidebarSectionProps) {
  return (
    <Flex
      data-slot="sidebar-content"
      minH="0"
      flex="1"
      direction="column"
      overflowY="auto"
      overflowX="hidden"
      {...props}
    >
      {children}
    </Flex>
  );
}

export function SidebarFooter({ children, ...props }: SidebarSectionProps) {
  return (
    <Flex data-slot="sidebar-footer" mt="auto" direction="column" {...props}>
      {children}
    </Flex>
  );
}

type SidebarGroupProps = ComponentProps<typeof Box>;

export function SidebarGroup({ children, ...props }: SidebarGroupProps) {
  return (
    <Box
      as="section"
      data-slot="sidebar-group"
      display="flex"
      flexDirection="column"
      gap="2"
      {...props}
    >
      {children}
    </Box>
  );
}

type SidebarGroupLabelProps = ComponentProps<typeof Text>;

export function SidebarGroupLabel({ children, ...props }: SidebarGroupLabelProps) {
  return (
    <Text
      data-slot="sidebar-group-label"
      px="3"
      textStyle="caption"
      fontWeight="semibold"
      textTransform="uppercase"
      letterSpacing="0.12em"
      color="fg.muted"
      {...props}
    >
      {children}
    </Text>
  );
}

type SidebarMenuProps = ComponentProps<typeof Box>;

export function SidebarMenu({ children, ...props }: SidebarMenuProps) {
  return (
    <Box
      as="ul"
      data-slot="sidebar-menu"
      display="flex"
      flexDirection="column"
      gap="1"
      {...props}
    >
      {children}
    </Box>
  );
}

type SidebarMenuItemProps = ComponentProps<typeof Box>;

export function SidebarMenuItem({ children, ...props }: SidebarMenuItemProps) {
  return (
    <Box as="li" data-slot="sidebar-menu-item" listStyleType="none" {...props}>
      {children}
    </Box>
  );
}

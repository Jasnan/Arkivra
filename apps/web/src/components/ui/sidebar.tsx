import * as React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarContext, useSidebar } from '@/components/ui/sidebar-context';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SidebarProviderProps = React.ComponentPropsWithoutRef<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SidebarProvider({
  className,
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
        <div
          data-slot="sidebar-wrapper"
          data-state={open ? 'expanded' : 'collapsed'}
          className={cn('group/sidebar-wrapper flex min-h-screen w-full', className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext>
  );
}

type SidebarProps = React.ComponentPropsWithoutRef<'aside'> & {
  collapsible?: 'icon' | 'offcanvas' | 'none';
  variant?: 'default' | 'inset';
};

export function Sidebar({
  className,
  children,
  collapsible = 'icon',
  variant = 'default',
  ...props
}: SidebarProps) {
  const { open } = useSidebar();
  const isCollapsed = collapsible === 'icon' && !open;
  const isOffcanvas = collapsible === 'offcanvas' && !open;

  return (
    <aside
      data-slot="sidebar"
      data-state={open ? 'expanded' : 'collapsed'}
      data-collapsible={isCollapsed ? 'icon' : isOffcanvas ? 'offcanvas' : ''}
      aria-hidden={isOffcanvas ? true : undefined}
      className={cn(
        'group/sidebar peer sticky top-0 hidden shrink-0 text-sidebar-foreground lg:block',
        variant === 'inset' ? 'h-screen p-2' : 'h-screen',
        isCollapsed
          ? 'w-[var(--sidebar-width-icon)]'
          : isOffcanvas
            ? 'w-0 p-0 opacity-0'
            : 'w-[var(--sidebar-width)]',
        'transition-[width] duration-200 ease-linear',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-full flex-col bg-sidebar',
          variant === 'inset'
            ? 'bg-transparent'
            : 'border-r border-sidebar-border/70',
          isOffcanvas && 'pointer-events-none overflow-hidden opacity-0',
        )}
      >
        {children}
      </div>
    </aside>
  );
}

type SidebarTriggerProps = Omit<React.ComponentProps<typeof Button>, 'aria-label' | 'title'>;

export function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps) {
  const { open, toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      className={cn(
        'size-8 rounded-lg text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          toggleSidebar();
        }
      }}
      {...props}
    >
      {open ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
    </Button>
  );
}

type SidebarRailProps = React.ComponentPropsWithoutRef<'div'>;

export function SidebarRail({ className, ...props }: SidebarRailProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-y-3 right-0 hidden w-px translate-x-1/2 rounded-full bg-sidebar-border/80 lg:block',
        className,
      )}
      {...props}
    />
  );
}

type SidebarInsetProps = React.ComponentPropsWithoutRef<'div'>;

export function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn('flex min-w-0 flex-1 flex-col', className)}
      {...props}
    />
  );
}

type SidebarSectionProps = React.ComponentPropsWithoutRef<'div'>;

export function SidebarHeader({ className, ...props }: SidebarSectionProps) {
  return <div data-slot="sidebar-header" className={cn('flex flex-col', className)} {...props} />;
}

export function SidebarContent({ className, ...props }: SidebarSectionProps) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: SidebarSectionProps) {
  return <div data-slot="sidebar-footer" className={cn('mt-auto flex flex-col', className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: SidebarSectionProps) {
  return <section data-slot="sidebar-group" className={cn('flex flex-col gap-2', className)} {...props} />;
}

type SidebarGroupLabelProps = React.ComponentPropsWithoutRef<'p'>;

export function SidebarGroupLabel({ className, ...props }: SidebarGroupLabelProps) {
  return (
    <p
      data-slot="sidebar-group-label"
      className={cn(
        'px-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45',
        className,
      )}
      {...props}
    />
  );
}

type SidebarMenuProps = React.ComponentPropsWithoutRef<'ul'>;

export function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return <ul data-slot="sidebar-menu" className={cn('flex flex-col gap-1', className)} {...props} />;
}

type SidebarMenuItemProps = React.ComponentPropsWithoutRef<'li'>;

export function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps) {
  return <li data-slot="sidebar-menu-item" className={cn('list-none', className)} {...props} />;
}

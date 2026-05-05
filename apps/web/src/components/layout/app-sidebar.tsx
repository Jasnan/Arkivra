import type { ComponentProps, ComponentType } from 'react';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';
import type { LucideProps } from 'lucide-react';
import arkivraLogoUrl from '@/assets/arkivra-logo.png';
import packageJson from '../../../package.json';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar-context';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SidebarNavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

interface AppSidebarProps {
  primaryNavItems: SidebarNavItem[];
  footerNavItems: SidebarNavItem[];
  variant?: ComponentProps<typeof Sidebar>['variant'];
}

function isNavItemActive(pathname: string, item: SidebarNavItem) {
  if (item.to === '/documents') {
    return pathname === '/documents';
  }

  return Boolean(matchPath({ path: item.to, end: false }, pathname));
}

function AppSidebarNavItem({ item }: { item: SidebarNavItem }) {
  const { open } = useSidebar();
  const location = useLocation();
  const Icon = item.icon;
  const isActive = isNavItemActive(location.pathname, item);

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/documents'}
      aria-label={!open ? item.label : undefined}
      title={!open ? item.label : undefined}
      className={cn(
        'group/nav-item flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
        open ? 'justify-start' : 'justify-center px-2.5',
        isActive
          ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center transition-colors',
          isActive
            ? 'text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 group-hover/nav-item:text-sidebar-accent-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className={cn('truncate', !open && 'hidden')}>{item.label}</span>
    </NavLink>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" align="center" className={cn(open && 'hidden')}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({ primaryNavItems, footerNavItems, variant = 'default' }: AppSidebarProps) {
  const { open } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant={variant}>
      <SidebarHeader className="px-3 py-4">
        <Link
          to="/vaults"
          className={cn(
            'flex items-center gap-3 rounded-lg px-2 py-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground',
            !open && 'justify-center px-1.5',
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <img src={arkivraLogoUrl} alt="Arkivra" className="size-6 object-contain brightness-0 invert" />
          </span>
          <div className={cn('min-w-0', !open && 'hidden')}>
            <p className="font-display text-base font-semibold leading-none">Arkivra</p>
            <p className="mt-1 text-sm leading-none text-sidebar-foreground/65">
              v{packageJson.version}
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 pb-3">
        <SidebarGroup>
          <SidebarGroupLabel className={cn(!open && 'sr-only')}>Library</SidebarGroupLabel>
          <nav aria-label="Primary">
            <SidebarMenu>
              {primaryNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <AppSidebarNavItem item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 px-3 py-3">
        <SidebarGroup className="gap-3">
          <SidebarGroupLabel className={cn(!open && 'sr-only')}>Settings</SidebarGroupLabel>
          <nav aria-label="Secondary">
            <SidebarMenu>
              {footerNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <AppSidebarNavItem item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

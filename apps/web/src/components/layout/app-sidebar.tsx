import type { ComponentProps, ComponentType } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { Box, Flex, Text, useMediaQuery } from '@chakra-ui/react';
import { ArkivraLogo } from '@/components/brand/arkivra-logo';
import { ROUTES } from '@/app/routes';
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

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

interface AppSidebarProps {
  primaryNavItems: SidebarNavItem[];
  footerNavItems: SidebarNavItem[];
  variant?: ComponentProps<typeof Sidebar>['variant'];
}

function AppSidebarNavItem({ item }: { item: SidebarNavItem }) {
  const { open } = useSidebar();
  const Icon = item.icon;
  const location = useLocation();
  const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

  return (
    <Link
      to={item.to}
      aria-label={!open ? item.label : undefined}
      title={!open ? item.label : undefined}
      style={{ color: 'inherit' }}
    >
      <Flex
        align="center"
        gap="3"
        rounded="lg"
        px="2.5"
        py="2"
        fontSize="sm"
        fontWeight="medium"
        justify={open ? 'flex-start' : 'center'}
        bg={isActive ? 'teal.subtle' : 'transparent'}
        color={isActive ? 'teal.fg' : 'fg.muted'}
        transition="colors"
        _hover={{ bg: isActive ? 'teal.subtle' : 'bg.muted', color: isActive ? 'teal.fg' : 'fg' }}
      >
        <Flex
          shrink={0}
          boxSize="4"
          align="center"
          justify="center"
          color={isActive ? 'teal.fg' : 'fg.muted'}
          transition="colors"
          _groupHover={{ color: 'teal.fg' }}
        >
          <Icon size={16} />
        </Flex>
        <Text as="span" truncate display={open ? undefined : 'none'}>
          {item.label}
        </Text>
      </Flex>
    </Link>
  );
}

export function AppSidebar({ primaryNavItems, footerNavItems, variant = 'default' }: AppSidebarProps) {
  const { open } = useSidebar();
  const [isMdAndUp] = useMediaQuery(['(min-width: 768px)'], { ssr: false });

  return (
    <Sidebar collapsible={isMdAndUp ? 'icon' : 'offcanvas'} variant={variant}>
      <SidebarHeader px="3" py="4">
        <Link
          to={ROUTES.vaults}
          style={{ display: 'contents' }}
        >
          <Flex
            align="center"
            gap="3"
            rounded="lg"
            px="2"
            py="1.5"
            color="fg"
            justify={open ? 'flex-start' : 'center'}
            transition="colors"
            _hover={{ bg: 'bg.muted', color: 'fg' }}
          >
            <Flex
              shrink={0}
              boxSize="9"
              align="center"
              justify="center"
              rounded="xl"
              bg="teal.solid"
              color="fg.inverted"
              shadow="sm"
            >
              <ArkivraLogo boxSize="7" />
            </Flex>
            <Box minW="0" display={open ? undefined : 'none'}>
              <Text fontFamily="heading" fontSize="base" fontWeight="semibold" lineHeight="none">
                Arkivra
              </Text>
              <Text mt="1" fontSize="sm" lineHeight="none" color="fg.muted">
                v{packageJson.version}
              </Text>
            </Box>
          </Flex>
        </Link>
      </SidebarHeader>

      <SidebarContent px="3" pb="3">
        <SidebarGroup>
          <SidebarGroupLabel display={open ? undefined : 'none'}>
            Library
          </SidebarGroupLabel>
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

      <SidebarFooter borderTopWidth="1px" borderColor="border.subtle" px="3" py="3">
        <SidebarGroup gap="3">
          <SidebarGroupLabel display={open ? undefined : 'none'}>
            Settings
          </SidebarGroupLabel>
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

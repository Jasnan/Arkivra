/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import {
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  DatabaseBackup,
  FileText,
  Info,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Trash2,
  Upload,
  UserCircle2,
  Users,
  Vault,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Box, Collapsible, Flex, Menu, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import packageJson from '../../../package.json';
import { ArkivraLogo } from '@/components/brand/arkivra-logo';
import { SecondaryNavLink } from '@/components/layout/secondary-nav-link';
import type { SecondaryNavIcon } from '@/components/layout/secondary-nav-link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { ROUTES } from '@/app/routes';

export interface PrimaryNavItem {
  id: 'vaults' | 'chat' | 'search' | 'tags' | 'transfers' | 'trash';
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

const primaryNavItems: PrimaryNavItem[] = [
  { id: 'vaults', to: ROUTES.vaults, label: 'Vaults', icon: Vault },
  { id: 'chat', to: ROUTES.chat, label: 'Chat', icon: MessageSquare },
  { id: 'search', to: ROUTES.search, label: 'Search', icon: Search },
  { id: 'tags', to: ROUTES.tags, label: 'Tags', icon: Tags },
  { id: 'transfers', to: ROUTES.transfers, label: 'Transfers', icon: Upload },
  { id: 'trash', to: ROUTES.trash, label: 'Trash', icon: Trash2 },
];

const UNIFIED_SIDEBAR_WIDTH = '14rem';
const UNIFIED_SIDEBAR_COLLAPSED_WIDTH = '3.75rem';
const SIDEBAR_ICON_ITEM_SIZE = '2.5rem';
const SIDEBAR_BRAND_COLLAPSED_LOGO_SIZE = '2rem';
const SIDEBAR_BRAND_EXPANDED_LOGO_SIZE = '2.25rem';

export interface SecondaryRouteNavItem {
  to: string;
  label: string;
  description: string;
  icon: SecondaryNavIcon;
}

export const settingsNavItems = [
  {
    to: ROUTES.settingsAccount,
    label: 'Profile',
    description: 'Profile & account details',
    icon: UserCircle2,
  },
  {
    to: ROUTES.settingsSecurity,
    label: 'Security',
    description: 'Password, 2FA & sessions',
    icon: Shield,
  },
  {
    to: ROUTES.settingsPreferences,
    label: 'Preferences',
    description: 'Regional & workflow defaults',
    icon: SlidersHorizontal,
  },
  {
    to: ROUTES.settingsAbout,
    label: 'About',
    description: 'Version & information',
    icon: Info,
  },
] satisfies readonly SecondaryRouteNavItem[];

export const adminNavItems = [
  {
    to: ROUTES.adminOverview,
    label: 'Overview',
    description: 'Instance status',
    icon: LayoutDashboard,
  },
  {
    to: ROUTES.adminUsers,
    label: 'Users',
    description: 'Access & privileges',
    icon: Users,
  },
  {
    to: ROUTES.adminAuditLog,
    label: 'Audit',
    description: 'Security events',
    icon: ShieldCheck,
  },
  {
    to: ROUTES.adminBackups,
    label: 'Backups',
    description: 'Archive control',
    icon: DatabaseBackup,
  },
  {
    to: ROUTES.adminAiSettings,
    label: 'AI',
    description: 'Ollama defaults',
    icon: BrainCircuit,
  },
  {
    to: ROUTES.adminOfficeConverter,
    label: 'Office Converter',
    description: 'Document previews',
    icon: FileText,
  },
] satisfies readonly SecondaryRouteNavItem[];

const SIDEBAR_ACCOUNT_LABEL_MAX_LENGTH = 15;
const PRIMARY_SIDEBAR_STORAGE_KEY = 'arkivra:primary-sidebar-state';

export function isChatPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 'chat' || (parts[0] === 'vaults' && (parts[2] === 'chat' || parts[3] === 'chat'));
}

export function readPrimarySidebarExpandedPreference() {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    if (typeof window.localStorage?.getItem !== 'function') {
      return true;
    }

    const storedState = window.localStorage.getItem(PRIMARY_SIDEBAR_STORAGE_KEY);
    return storedState !== 'collapsed';
  } catch {
    return true;
  }
}

export function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true;
  }

  if (target.closest('[role="textbox"], [role="searchbox"]')) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  const textInputTypes = new Set([
    '',
    'email',
    'number',
    'password',
    'search',
    'tel',
    'text',
    'url',
  ]);

  return textInputTypes.has(target.type);
}

const accountMenuItemProps = {
  cursor: 'default',
  minH: 'var(--arkivra-menuItemMinHeight, 2.5rem)',
  rounded: 'md',
  px: '3',
  py: 'var(--arkivra-menuItemPaddingY, 0.5rem)',
  color: 'fg.muted',
  borderWidth: '1px',
  borderColor: 'transparent',
  _highlighted: { bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' },
} as const;

const primaryShellItemProps = {
  borderWidth: '1px',
  borderColor: 'transparent',
  borderLeftWidth: '2px',
  transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
} as const;

function getPrimaryShellItemState(active: boolean) {
  return {
    bg: active ? 'teal.subtle' : 'transparent',
    borderColor: active ? 'teal.muted' : 'transparent',
    borderLeftColor: active ? 'teal.solid' : 'transparent',
    color: active ? 'teal.fg' : 'shell.inactiveForeground',
    _hover: {
      bg: 'teal.subtle',
      borderColor: 'teal.muted',
      borderLeftColor: 'teal.solid',
      color: 'teal.fg',
    },
  } as const;
}

function truncateSidebarAccountLabel(label: string) {
  if (label.length <= SIDEBAR_ACCOUNT_LABEL_MAX_LENGTH) {
    return label;
  }

  return `${label.slice(0, SIDEBAR_ACCOUNT_LABEL_MAX_LENGTH).trimEnd()}...`;
}

export function primaryNavId(pathname: string): PrimaryNavItem['id'] | null {
  const parts = pathname.split('/').filter(Boolean);

  if (isChatPath(pathname)) return 'chat';
  if (pathname === ROUTES.search) return 'search';
  if (pathname === ROUTES.tags) return 'tags';
  if (pathname === ROUTES.trash || parts[0] === 'trash') return 'trash';
  if (pathname === ROUTES.transfers) return 'transfers';

  if (parts[0] === 'vaults' || pathname === ROUTES.vaults || pathname === ROUTES.root) return 'vaults';

  return null;
}

function SidebarTooltip({ label, children, disabled = false }: { label: string; children: ReactNode; disabled?: boolean }) {
  if (disabled) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarLabel({
  expanded,
  fontWeight,
  children,
}: {
  expanded: boolean;
  fontWeight: 'medium' | 'semibold';
  children: ReactNode;
}) {
  return (
    <Text
      as="span"
      truncate
      aria-hidden={!expanded}
      maxW={expanded ? '10rem' : '0'}
      opacity={expanded ? 1 : 0}
      overflow="hidden"
      textStyle="sidebar"
      fontWeight={fontWeight}
      transition="opacity 150ms ease, max-width 180ms ease"
    >
      {children}
    </Text>
  );
}

export function UnifiedSidebarNavLink({
  item,
  active,
  expanded,
  depth = 0,
}: {
  item: Pick<PrimaryNavItem, 'to' | 'label' | 'icon'>;
  active: boolean;
  expanded: boolean;
  depth?: number;
}) {
  const Icon = item.icon;

  return (
    <SidebarTooltip label={item.label} disabled={expanded}>
      <Link
        to={item.to}
        aria-label={!expanded ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        title={!expanded ? item.label : undefined}
        style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
      >
        <Flex
          minH={SIDEBAR_ICON_ITEM_SIZE}
          w="full"
          align="center"
          justify={expanded ? 'flex-start' : 'center'}
          gap={expanded ? '2.5' : '0'}
          rounded="sm"
          px={expanded ? '2.5' : '0'}
          py="1.5"
          pl={expanded ? `${0.625 + depth * 0.85}rem` : '0'}
          {...primaryShellItemProps}
          {...getPrimaryShellItemState(active)}
        >
          <Flex boxSize="5" shrink={0} align="center" justify="center">
            <Icon size={17} strokeWidth={2.1} />
          </Flex>
          <SidebarLabel expanded={expanded} fontWeight={active ? 'semibold' : 'medium'}>
            {item.label}
          </SidebarLabel>
        </Flex>
      </Link>
    </SidebarTooltip>
  );
}

function UnifiedSidebarNavButton({
  item,
  active,
  expanded,
  onClick,
}: {
  item: Pick<PrimaryNavItem, 'label' | 'icon'>;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <SidebarTooltip label={item.label} disabled={expanded}>
      <chakra.button
        type="button"
        aria-label={!expanded ? item.label : undefined}
        title={!expanded ? item.label : undefined}
        display="flex"
        minH={SIDEBAR_ICON_ITEM_SIZE}
        w="full"
        alignItems="center"
        justifyContent={expanded ? 'flex-start' : 'center'}
        gap={expanded ? '2.5' : '0'}
        rounded="sm"
        {...primaryShellItemProps}
        {...getPrimaryShellItemState(active)}
        px={expanded ? '2.5' : '0'}
        py="1.5"
        cursor="pointer"
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
        onClick={onClick}
      >
        <Flex boxSize="5" shrink={0} align="center" justify="center">
          <Icon size={17} strokeWidth={2.1} />
        </Flex>
        <SidebarLabel expanded={expanded} fontWeight={active ? 'semibold' : 'medium'}>
          {item.label}
        </SidebarLabel>
      </chakra.button>
    </SidebarTooltip>
  );
}

function SidebarNavGroup({
  label,
  icon,
  items,
  currentPathname,
  expanded,
}: {
  label: string;
  icon: ComponentType<LucideProps>;
  items: readonly SecondaryRouteNavItem[];
  currentPathname: string;
  expanded: boolean;
}) {
  const Icon = icon;
  const groupActive = items.some((item) => isSecondaryRouteNavItemActive(item.to, currentPathname));
  const [manuallyOpen, setManuallyOpen] = useState(groupActive);
  const open = manuallyOpen || groupActive;

  return (
    <Collapsible.Root open={open} onOpenChange={(event) => setManuallyOpen(event.open)}>
      <SidebarTooltip label={label} disabled={expanded}>
        <Collapsible.Trigger asChild>
          <chakra.button
            type="button"
            aria-label={!expanded ? label : undefined}
            display="flex"
            minH={SIDEBAR_ICON_ITEM_SIZE}
            w="full"
            alignItems="center"
            justifyContent={expanded ? 'flex-start' : 'center'}
            gap={expanded ? '2.5' : '0'}
            rounded="sm"
            {...primaryShellItemProps}
            {...getPrimaryShellItemState(groupActive)}
            px={expanded ? '2.5' : '0'}
            py="1.5"
            cursor="pointer"
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
          >
            <Flex boxSize="5" shrink={0} align="center" justify="center">
              <Icon size={17} strokeWidth={2.1} />
            </Flex>
            <SidebarLabel expanded={expanded} fontWeight={groupActive ? 'semibold' : 'medium'}>
              {label}
            </SidebarLabel>
            <Box ml="auto" display={expanded ? 'flex' : 'none'} color={groupActive ? 'shell.selectionForeground' : 'shell.inactiveForeground'}>
              {open ? <ChevronDown size={15} strokeWidth={2.25} /> : <ChevronRight size={15} strokeWidth={2.25} />}
            </Box>
          </chakra.button>
        </Collapsible.Trigger>
      </SidebarTooltip>

      <Collapsible.Content>
        <Stack as="ul" listStyleType="none" gap="1" mt="1" pl={expanded ? '2' : '0'}>
          {items.map((item) => (
            <Box as="li" key={item.to}>
              <UnifiedSidebarNavLink
                item={item}
                active={isSecondaryRouteNavItemActive(item.to, currentPathname)}
                expanded={expanded}
                depth={expanded ? 1 : 0}
              />
            </Box>
          ))}
        </Stack>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function UnifiedSidebar({
  expanded,
  activeNavId,
  currentPathname,
  sessionAccountLabel,
  isAdmin,
  aiFeaturesEnabled,
  onOpenTransfers,
  onToggleExpanded,
  onSignOut,
}: {
  expanded: boolean;
  activeNavId: PrimaryNavItem['id'] | null;
  currentPathname: string;
  sessionAccountLabel?: string | null;
  isAdmin?: boolean;
  aiFeaturesEnabled: boolean;
  onOpenTransfers: () => void;
  onToggleExpanded: () => void;
  onSignOut: () => void;
}) {
  const roleLabel = isAdmin ? 'Admin' : 'Member';
  const accountLabel = sessionAccountLabel ?? 'Signed in';
  const sidebarAccountLabel = truncateSidebarAccountLabel(accountLabel);
  const visiblePrimaryNavItems = aiFeaturesEnabled
    ? primaryNavItems
    : primaryNavItems.filter(item => item.id !== 'chat');

  return (
    <Flex
      as="aside"
      aria-label="Primary sidebar"
      w={expanded ? UNIFIED_SIDEBAR_WIDTH : UNIFIED_SIDEBAR_COLLAPSED_WIDTH}
      h="100dvh"
      shrink={0}
      direction="column"
      borderRightWidth="1px"
      borderColor="shell.border"
      bg="shell.sideBar"
      px="2.5"
      pt="2.5"
      pb="3"
      transition="width 180ms ease"
      overflow="hidden"
    >
      <Box flexShrink={0} mb={expanded ? '4' : '3'}>
        <SidebarTooltip label="Arkivra" disabled={expanded}>
          <chakra.button
            type="button"
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            display="flex"
            minW="0"
            w="full"
            minH={SIDEBAR_ICON_ITEM_SIZE}
            alignItems="center"
            justifyContent={expanded ? 'flex-start' : 'center'}
            gap={expanded ? '2.5' : '0'}
            rounded="md"
            px={expanded ? '1.5' : '0'}
            py={expanded ? '1.5' : '0'}
            color="shell.foreground"
            cursor="pointer"
            transition="background-color 150ms ease, color 150ms ease"
            _hover={{ bg: 'shell.hoverBackground' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
            onClick={onToggleExpanded}
          >
            <Flex
              boxSize={expanded ? SIDEBAR_BRAND_EXPANDED_LOGO_SIZE : SIDEBAR_BRAND_COLLAPSED_LOGO_SIZE}
              shrink={0}
              align="center"
              justify="center"
              rounded="lg"
              bg={{ base: 'gray.50', _dark: 'gray.50' }}
              borderWidth="1px"
              borderColor={{ base: 'gray.200', _dark: 'gray.200' }}
              p="1"
              overflow="hidden"
              boxShadow="xs"
              transition="transform 180ms ease"
            >
              <ArkivraLogo boxSize="full" objectFit="contain" />
            </Flex>
            <Box
              minW="0"
              display={expanded ? 'block' : 'none'}
              maxW={expanded ? '8rem' : '0'}
              opacity={expanded ? 1 : 0}
              overflow="hidden"
              textAlign="left"
              transition="opacity 160ms ease, max-width 180ms ease"
            >
              <Text fontFamily="heading" fontSize="base" fontWeight="semibold" letterSpacing="heading" lineHeight="none" color="shell.sideBarTitleForeground">
                Arkivra
              </Text>
              <Text textStyle="caption" lineHeight="none" color="shell.inactiveForeground">
                v{packageJson.version}
              </Text>
            </Box>
          </chakra.button>
        </SidebarTooltip>
      </Box>

      <Box
        flex="1"
        minH="0"
        minW="0"
        overflowY="auto"
        overflowX="hidden"
        css={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'transparent transparent',
          '&:hover, &:focus-within': {
            scrollbarColor: 'var(--chakra-colors-border-strong) transparent',
          },
          '&::-webkit-scrollbar': {
            width: '0.5rem',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'transparent',
            borderRadius: '999px',
            border: '2px solid transparent',
            backgroundClip: 'content-box',
          },
          '&:hover::-webkit-scrollbar-thumb, &:focus-within::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--chakra-colors-border-strong)',
          },
        }}
      >
        <Stack
          as="nav"
          aria-label="Primary"
          gap="1"
          minW="0"
        >
          {visiblePrimaryNavItems.map((item) => (
            item.id === 'transfers' ? (
              <UnifiedSidebarNavButton
                key={item.id}
                item={item}
                active={activeNavId === item.id}
                expanded={expanded}
                onClick={onOpenTransfers}
              />
            ) : (
              <UnifiedSidebarNavLink
                key={item.id}
                item={item}
                active={activeNavId === item.id}
                expanded={expanded}
              />
            )
          ))}
        </Stack>

        <Box my="4" borderTopWidth="1px" borderColor="shell.border" />

        <Stack gap="1" minW="0">
          <SidebarNavGroup
            label="Settings"
            icon={Settings}
            items={settingsNavItems}
            currentPathname={currentPathname}
            expanded={expanded}
          />
          {isAdmin ? (
            <SidebarNavGroup
              label="Admin"
              icon={ShieldCheck}
              items={adminNavItems}
              currentPathname={currentPathname}
              expanded={expanded}
            />
          ) : null}
        </Stack>
      </Box>

      <Stack flexShrink={0} gap="2" minW="0" pt="2">
        <Box borderTopWidth="1px" borderColor="shell.border" />
        <Flex align="center" justify={expanded ? 'stretch' : 'center'} pt="2">
          <SidebarTooltip label="Theme" disabled={expanded}>
            <Box w="full">
              <ThemeToggle expanded={expanded} />
            </Box>
          </SidebarTooltip>
        </Flex>

        <Menu.Root lazyMount unmountOnExit typeahead={false} positioning={{ placement: expanded ? 'right-end' : 'right-end' }}>
          <Menu.Trigger asChild>
            <chakra.button
              type="button"
              aria-label="Open account menu"
              display="flex"
              alignItems="center"
              justifyContent={expanded ? 'flex-start' : 'center'}
              gap="2"
              minH="2.25rem"
              w="full"
              rounded="md"
              color="shell.inactiveForeground"
              borderWidth="1px"
              borderColor="shell.border"
              bg="transparent"
              px={expanded ? '2' : '0'}
              cursor="pointer"
              _hover={{ color: 'shell.selectionForeground', bg: 'shell.hoverBackground' }}
            >
              <UserCircle2 size={18} strokeWidth={2.1} />
              <Box minW="0" textAlign="left" display={expanded ? undefined : 'none'}>
                <Text truncate fontSize="xs" fontWeight="medium" color="shell.foreground" title={accountLabel}>
                  {sidebarAccountLabel}
                </Text>
                <Text mt="0.5" fontSize="2xs" color="shell.inactiveForeground">
                  {roleLabel}
                </Text>
              </Box>
            </chakra.button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content
                minW="60"
                overflow="hidden"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.surface"
                p="1.5"
                shadow="lg"
              >
                <Box px="3" py="2">
                  <Text fontWeight="medium" color="fg">
                    {accountLabel}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {roleLabel}
                  </Text>
                </Box>
                <Menu.Separator />
                <Menu.Item value="account-settings" asChild {...accountMenuItemProps}>
                  <Link to={ROUTES.settingsAccount}>
                    <Settings size={16} />
                    Account settings
                  </Link>
                </Menu.Item>
                {isAdmin ? (
                  <Menu.Item value="admin" asChild {...accountMenuItemProps}>
                    <Link to={ROUTES.admin}>
                      <ShieldCheck size={16} />
                      Admin console
                    </Link>
                  </Menu.Item>
                ) : null}
                <Menu.Separator />
                <Menu.Item value="sign-out" {...accountMenuItemProps} onClick={onSignOut}>
                  <LogOut size={16} />
                  Sign out
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Stack>
    </Flex>
  );
}

function isSecondaryRouteNavItemActive(to: string, pathname: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function SecondaryRouteNavList({
  items,
  currentPathname,
  label,
}: {
  items: readonly SecondaryRouteNavItem[];
  currentPathname: string;
  label: string;
}) {
  return (
    <Stack as="nav" aria-label={label} gap="1">
      {items.map((item) => (
        <SecondaryNavLink
          key={item.to}
          to={item.to}
          label={item.label}
          description={item.description}
          icon={item.icon}
          active={isSecondaryRouteNavItemActive(item.to, currentPathname)}
          density="compact"
        />
      ))}
    </Stack>
  );
}

export function SecondarySidebar({
  kind,
  isOpen,
  customContent,
  currentPathname,
}: {
  kind: 'vault' | 'chat' | 'settings' | 'admin' | 'standard';
  isOpen: boolean;
  customContent: ReactNode | null;
  currentPathname: string;
}) {
  const usesSecondaryNavSystem = kind === 'settings' || kind === 'admin' || (kind === 'chat' && customContent !== null) || (kind === 'vault' && customContent !== null);

  return (
    <Flex
      as="aside"
      aria-label="Secondary"
      aria-hidden={!isOpen}
      display={{ base: 'none', md: 'flex' }}
      w={isOpen ? { md: '15.75rem', xl: '17rem' } : '0'}
      h="100dvh"
      shrink={0}
      direction="column"
      borderLeftWidth={isOpen ? '1px' : '0'}
      borderLeftColor="shell.secondaryBorder"
      borderRightWidth={isOpen ? '1px' : '0'}
      borderRightColor="shell.secondaryBorder"
      boxShadow="none"
      bg="shell.secondarySideBar"
      color="shell.foreground"
      overflow="hidden"
      visibility={isOpen ? 'visible' : 'hidden'}
      pointerEvents={isOpen ? undefined : 'none'}
      transition="width 180ms ease, border-color 180ms ease, box-shadow 180ms ease"
    >
      <Box
        flex="1"
        minH="0"
        overflowY="auto"
        px={usesSecondaryNavSystem ? '2' : '3'}
        py={usesSecondaryNavSystem ? '3.5' : '4'}
      >
        {kind === 'vault' ? (
          customContent
        ) : kind === 'settings' ? (
          customContent ?? (
            <SecondaryRouteNavList
              items={settingsNavItems}
              currentPathname={currentPathname}
              label="Settings navigation"
            />
          )
        ) : kind === 'admin' ? (
          <SecondaryRouteNavList
            items={adminNavItems}
            currentPathname={currentPathname}
            label="Admin navigation"
          />
        ) : customContent ?? (
          kind === 'chat' ? (
            <Text px="2" py="4" fontSize="sm" color="shell.inactiveForeground">
              Open a chat to see conversation history.
            </Text>
          ) : (
            <Stack gap="1">
              <SecondaryNavLink to={ROUTES.settingsAccount} label="Settings" icon={Settings} />
              <SecondaryNavLink to={ROUTES.settingsAbout} label="About" icon={Info} />
            </Stack>
          )
        )}
      </Box>
    </Flex>
  );
}

export function getSecondaryKind(pathname: string): 'vault' | 'chat' | 'settings' | 'admin' | 'standard' {
  const parts = pathname.split('/').filter(Boolean);
  if (isChatPath(pathname)) return 'chat';
  if (parts[0] === 'settings') return 'settings';
  if (parts[0] === 'admin') return 'admin';
  if (parts[0] === 'vaults' || pathname === ROUTES.vaults) return 'vault';
  return 'standard';
}

export function shouldHideSecondarySidebar(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return pathname === ROUTES.vaults
    || pathname === ROUTES.search
    || pathname === ROUTES.tags
    || pathname === ROUTES.transfers
    || isChatPath(pathname)
    || parts[0] === 'trash';
}

export function isVaultSectionSegment(value: string | undefined) {
  return value === 'members' || value === 'activity' || value === 'settings' || value === 'chat';
}

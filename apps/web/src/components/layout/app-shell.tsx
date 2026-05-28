import type { ComponentType, MouseEvent, ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  DatabaseBackup,
  FileSearch,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  SearchX,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Trash2,
  Upload,
  UserCircle2,
  Users,
  Info,
  Vault,
  X,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Box, Button as ChakraButton, Collapsible, Flex, HStack, IconButton, Input, Kbd, Menu, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import packageJson from '../../../package.json';
import { ArkivraLogo } from '@/components/brand/arkivra-logo';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AppEmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { SecondaryNavLink } from '@/components/layout/secondary-nav-link';
import type { SecondaryNavIcon } from '@/components/layout/secondary-nav-link';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { ROUTES } from '@/app/routes';
import { RouterDebugProbe } from '@/features/auth/auth-guards';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/features/documents/documents.utils';
import { useDocumentQuery } from '@/features/documents/documents.queries';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { BrowserContextMenu } from '@/features/file-browser/components/vault-browser-components';
import type { BrowserContextMenuEntry, ContextMenuState } from '@/features/file-browser/components/vault-browser.types';
import { useMeQuery } from '@/features/me/me.queries';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { TransfersDrawer } from '@/features/uploads/components/transfers-drawer';
import { uploadManager } from '@/features/uploads/upload-manager';
import { useUploadManagerState } from '@/features/uploads/use-upload-manager';
import {
  VAULT_TREE_ROOT_VALUE,
  VaultSidebarTree,
} from '@/features/vaults/components/vault-sidebar-tree';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

function getQuickSearchShortcut() {
  if (typeof navigator === 'undefined') {
    return { label: 'Super K', modifier: 'Super' };
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const isAppleDevice =
    platform.includes('mac') ||
    platform.includes('iphone') ||
    platform.includes('ipad') ||
    userAgent.includes('mac os');

  if (isAppleDevice) {
    return { label: 'Command K', modifier: '⌘' };
  }

  if (platform.includes('win') || userAgent.includes('windows')) {
    return { label: 'Windows K', modifier: 'Win' };
  }

  return { label: 'Super K', modifier: 'Super' };
}

interface BreadcrumbEntry {
  label: string;
  to?: string;
}

interface PrimaryNavItem {
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

interface SecondaryRouteNavItem {
  to: string;
  label: string;
  description: string;
  icon: SecondaryNavIcon;
}

const settingsNavItems = [
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

const adminNavItems = [
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
] satisfies readonly SecondaryRouteNavItem[];

const QUICK_SEARCH_QUERY_DEBOUNCE_MS = 280;
const SIDEBAR_ACCOUNT_LABEL_MAX_LENGTH = 15;

function isChatPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 'chat' || (parts[0] === 'vaults' && (parts[2] === 'chat' || parts[3] === 'chat'));
}

const accountMenuItemProps = {
  cursor: 'default',
  color: 'fg.muted',
  _highlighted: { bg: 'bg.muted', color: 'fg' },
} as const;

function truncateBreadcrumbLabel(label: string, maxLength = 10) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 3).trimEnd()}...`;
}

function truncateSidebarAccountLabel(label: string) {
  if (label.length <= SIDEBAR_ACCOUNT_LABEL_MAX_LENGTH) {
    return label;
  }

  return `${label.slice(0, SIDEBAR_ACCOUNT_LABEL_MAX_LENGTH).trimEnd()}...`;
}

function getVisibleBreadcrumbs(breadcrumbs: BreadcrumbEntry[]) {
  if (breadcrumbs.length <= 4) {
    return breadcrumbs;
  }

  return [
    breadcrumbs[0],
    breadcrumbs[1],
    null,
    breadcrumbs.at(-2)!,
    breadcrumbs.at(-1)!,
  ];
}

function buildBreadcrumbs({
  pathname,
  transferVaultId,
  vaultName,
  documentName,
}: {
  pathname: string;
  transferVaultId?: string | null;
  vaultName?: string;
  documentName?: string;
}): BreadcrumbEntry[] {
  const parts = pathname.split('/').filter(Boolean);
  const currentDocumentLabel = documentName ?? 'Document';

  if (parts.length === 0 || pathname === ROUTES.vaults) return [{ label: 'Vaults' }];
  if (isChatPath(pathname)) return [{ label: 'Chat' }];
  if (pathname === ROUTES.trash) return [{ label: 'Trash' }];
  if (parts[0] === 'trash' && parts[1]) return [{ label: 'Trash', to: ROUTES.trash }, { label: currentDocumentLabel }];
  if (pathname === ROUTES.tags) return [{ label: 'Tags' }];
  if (pathname === ROUTES.search) return [{ label: 'Search' }];
  if (parts[0] === 'settings') {
    if (pathname === ROUTES.twoFactorSetup) {
      return [
        { label: 'Settings', to: ROUTES.settingsAccount },
        { label: 'Security', to: ROUTES.settingsSecurity },
        { label: 'Set up 2FA' },
      ];
    }

    if (pathname === ROUTES.twoFactorManage) {
      return [
        { label: 'Settings', to: ROUTES.settingsAccount },
        { label: 'Security', to: ROUTES.settingsSecurity },
        { label: 'Manage 2FA' },
      ];
    }

    const sectionLabel = settingsNavItems.find((item) => item.to === pathname)?.label;
    return sectionLabel ? [{ label: 'Settings', to: ROUTES.settingsAccount }, { label: sectionLabel }] : [{ label: 'Settings' }];
  }
  if (parts[0] === 'admin') {
    const sectionLabel = adminNavItems.find((item) => item.to === pathname)?.label;
    return sectionLabel ? [{ label: 'Admin', to: ROUTES.adminOverview }, { label: sectionLabel }] : [{ label: 'Admin' }];
  }
  if (pathname === ROUTES.transfers) {
    if (!transferVaultId) return [{ label: 'Upload' }];

    return [
      { label: 'Vaults', to: ROUTES.vaults },
      { label: vaultName ?? 'Vault', to: ROUTES.vaultRoot(transferVaultId) },
      { label: 'Upload' },
    ];
  }

  if (parts[0] === 'vaults' && parts[1]) {
    const vaultLabel = vaultName ?? 'Vault';
    const vaultRootPath = ROUTES.vaultRoot(parts[1]);
    const base: BreadcrumbEntry[] = [
      { label: 'Vaults', to: ROUTES.vaults },
      { label: vaultLabel, to: vaultRootPath },
    ];

    if (parts.length === 2) return base;
    if (parts[2] === 'settings') return [...base, { label: 'Settings' }];
    if (parts[2] === 'chat') return [...base, { label: 'Chat' }];
    if (parts[3] === 'chat') return [...base, { label: currentDocumentLabel }, { label: 'Chat' }];
    if (parts[2]) return [...base, { label: currentDocumentLabel }];

    return base;
  }

  return [{ label: 'Arkivra' }];
}

function primaryNavId(pathname: string): PrimaryNavItem['id'] | null {
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

function UnifiedSidebarNavLink({
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
          gap="2.5"
          rounded="md"
          px={expanded ? '2.5' : '0'}
          py="1.5"
          pl={expanded ? `${0.625 + depth * 0.85}rem` : '0'}
          color={active ? 'teal.fg' : 'fg.muted'}
          bg={active ? 'bg.sidebar' : 'transparent'}
          borderWidth="1px"
          borderColor={active ? 'border.surface' : 'transparent'}
          transition="background-color 120ms ease, color 120ms ease"
          _hover={{ bg: active ? 'bg.sidebar' : 'bg.muted', color: active ? 'teal.fg' : 'fg' }}
        >
          <Flex boxSize="5" shrink={0} align="center" justify="center">
            <Icon size={17} strokeWidth={2.1} />
          </Flex>
          <Text as="span" truncate display={expanded ? undefined : 'none'} textStyle="sidebar" fontWeight={active ? 'semibold' : 'medium'}>
            {item.label}
          </Text>
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
        gap="2.5"
        rounded="md"
        borderWidth="1px"
        borderColor={active ? 'border.surface' : 'transparent'}
        bg={active ? 'bg.sidebar' : 'transparent'}
        color={active ? 'teal.fg' : 'fg.muted'}
        px={expanded ? '2.5' : '0'}
        py="1.5"
        cursor="pointer"
        transition="background-color 120ms ease, color 120ms ease"
        _hover={{ bg: active ? 'bg.sidebar' : 'bg.muted', color: active ? 'teal.fg' : 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
        onClick={onClick}
      >
        <Flex boxSize="5" shrink={0} align="center" justify="center">
          <Icon size={17} strokeWidth={2.1} />
        </Flex>
        <Text as="span" truncate display={expanded ? undefined : 'none'} textStyle="sidebar" fontWeight={active ? 'semibold' : 'medium'}>
          {item.label}
        </Text>
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
            gap="2.5"
            rounded="md"
            borderWidth="1px"
            borderColor={groupActive ? 'border.surface' : 'transparent'}
            bg={groupActive ? 'bg.sidebar' : 'transparent'}
            color={groupActive ? 'teal.fg' : 'fg.muted'}
            px={expanded ? '2.5' : '0'}
            py="1.5"
            cursor="pointer"
            transition="background-color 120ms ease, color 120ms ease"
            _hover={{ bg: groupActive ? 'bg.sidebar' : 'bg.muted', color: groupActive ? 'teal.fg' : 'fg' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
          >
            <Flex boxSize="5" shrink={0} align="center" justify="center">
              <Icon size={17} strokeWidth={2.1} />
            </Flex>
            <Text as="span" truncate display={expanded ? undefined : 'none'} textStyle="sidebar" fontWeight={groupActive ? 'semibold' : 'medium'}>
              {label}
            </Text>
            <Box ml="auto" display={expanded ? 'flex' : 'none'} color={groupActive ? 'teal.fg' : 'fg.subtle'}>
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

function UnifiedSidebar({
  expanded,
  activeNavId,
  currentPathname,
  sessionAccountLabel,
  isAdmin,
  onOpenTransfers,
  onSignOut,
}: {
  expanded: boolean;
  activeNavId: PrimaryNavItem['id'] | null;
  currentPathname: string;
  sessionAccountLabel?: string | null;
  isAdmin?: boolean;
  onOpenTransfers: () => void;
  onSignOut: () => void;
}) {
  const roleLabel = isAdmin ? 'Admin' : 'Member';
  const accountLabel = sessionAccountLabel ?? 'Signed in';
  const sidebarAccountLabel = truncateSidebarAccountLabel(accountLabel);

  return (
    <Flex
      as="aside"
      aria-label="Primary sidebar"
      w={expanded ? UNIFIED_SIDEBAR_WIDTH : UNIFIED_SIDEBAR_COLLAPSED_WIDTH}
      h="100vh"
      shrink={0}
      direction="column"
      borderRightWidth="1px"
      borderColor="border.surface"
      bg="bg.rail"
      px="2.5"
      pt="3"
      pb="3"
      transition="width 180ms ease"
      overflow="hidden"
    >
      <Flex align="center" gap="2" minW="0">
        <SidebarTooltip label="Arkivra" disabled={expanded}>
          <Link to={ROUTES.vaults} aria-label="Arkivra" style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
            <Flex
              minW="0"
              flex={expanded ? '1' : undefined}
              align="center"
              justify={expanded ? 'flex-start' : 'center'}
              gap="2.5"
              rounded="md"
              px={expanded ? '1.5' : '0'}
              py="1"
              color="fg"
              _hover={{ bg: 'bg.muted' }}
            >
              <Flex
                boxSize="9"
                shrink={0}
                align="center"
                justify="center"
                rounded="lg"
                bg="bg.sidebar"
                borderWidth="1px"
                borderColor="bg.inverted"
                p="1"
                overflow="hidden"
              >
                <ArkivraLogo boxSize="full" color="bg.inverted" />
              </Flex>
              <Box minW="0" display={expanded ? 'flex' : 'none'} flexDirection="column" gap={0}>
                <Text fontFamily="heading" fontSize="base" fontWeight="semibold" letterSpacing="heading" lineHeight="none">
                  Arkivra
                </Text>
                <Text textStyle="caption" lineHeight="none" color="fg.muted">
                  v{packageJson.version}
                </Text>
              </Box>
            </Flex>
          </Link>
        </SidebarTooltip>

      </Flex>

      <Box
        flex="1"
        minH="0"
        minW="0"
        overflowY="auto"
        overflowX="hidden"
        mt="5"
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
          {primaryNavItems.map((item) => (
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

        <Box my="4" borderTopWidth="1px" borderColor="border.surface" />

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
        <Box borderTopWidth="1px" borderColor="border.surface" />
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
              color="fg.muted"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.sidebar"
              px={expanded ? '2' : '0'}
              cursor="pointer"
              _hover={{ color: 'fg', bg: 'bg.muted' }}
            >
              <UserCircle2 size={18} strokeWidth={2.1} />
              <Box minW="0" textAlign="left" display={expanded ? undefined : 'none'}>
                <Text truncate fontSize="xs" fontWeight="medium" color="fg" title={accountLabel}>
                  {sidebarAccountLabel}
                </Text>
                <Text mt="0.5" fontSize="2xs" color="fg.muted">
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

function SecondarySidebar({
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
      h="100vh"
      shrink={0}
      direction="column"
      borderRightWidth={isOpen ? '1px' : '0'}
      borderRightColor="border.surface"
      boxShadow={isOpen ? '1px 0 0 var(--chakra-colors-border-subtle)' : 'none'}
      bg="bg.sidebar"
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
            <Text px="2" py="4" fontSize="sm" color="fg.muted">
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

function VaultFileTreePanel({
  activeVaultId,
  currentFolderId,
  currentDocumentId,
}: {
  activeVaultId: string;
  currentFolderId: string | null;
  currentDocumentId?: string | null;
}) {
  const navigate = useNavigate();
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [vaultTreeExpandedValue, setVaultTreeExpandedValue] = useState<string[]>([VAULT_TREE_ROOT_VALUE]);
  const folderTreeQuery = useFolderTreeQuery({
    vaultId: activeVaultId,
    enabled: activeVaultId.length > 0,
  });
  const contextVaultId = contextMenu?.item.type === 'background' || contextMenu?.item.type === 'root'
    ? contextMenu.item.vaultId
    : activeVaultId;

  function getVaultContextMenuActions(vaultId: string): BrowserContextMenuEntry[] {
    return [
      { key: 'open', label: 'Open', icon: FolderOpen, onSelect: () => navigate({ to: ROUTES.vaultRoot(vaultId) }) },
      { key: 'members', label: 'Members', icon: Users, onSelect: () => navigate({ to: ROUTES.vaultMembers(vaultId) }) },
      { key: 'activity', label: 'Activity', icon: History, onSelect: () => navigate({ to: ROUTES.vaultActivity(vaultId) }) },
      { key: 'settings', label: 'Settings', icon: Settings2, onSelect: () => navigate({ to: ROUTES.vaultSettings(vaultId) }) },
      { key: 'chat', label: 'Chat', icon: MessageSquare, onSelect: () => navigate({ to: ROUTES.vaultChat(vaultId) }) },
    ];
  }

  function openVaultContextMenu(event: MouseEvent<HTMLElement>, vaultId: string) {
    const vault = vaults.find(item => item.id === vaultId);

    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item: {
        type: 'background',
        vaultId,
        folderId: null,
        name: vault?.name ?? 'Vault',
      },
      x: event.clientX,
      y: event.clientY,
    });
  }

  return (
    <Flex
      as="aside"
      aria-label="Vault file tree"
      w={{ base: 'full', md: '15.75rem', xl: '17rem' }}
      h={{ base: '12rem', md: 'full' }}
      maxH={{ base: '12rem', md: 'none' }}
      minW={{ base: '0', md: '15.75rem', xl: '17rem' }}
      shrink={0}
      direction="column"
      borderRightWidth={{ base: '0', md: '1px' }}
      borderBottomWidth={{ base: '1px', md: '0' }}
      borderColor="border.surface"
      boxShadow={{ base: 'none', md: '1px 0 0 var(--chakra-colors-border-subtle)' }}
      bg="bg.sidebar"
      overflow="hidden"
    >
      <Box flex="1" minH="0" overflowY="auto" px="3" py="4" pr="2">
        <VaultSidebarTree
          vaults={vaultsQuery.data?.vaults ?? []}
          activeVaultId={activeVaultId}
          activeVaultRootOnly
          expandedValue={vaultTreeExpandedValue}
          onExpandedValueChange={setVaultTreeExpandedValue}
          currentFolderId={currentFolderId}
          currentDocumentId={currentDocumentId}
          folders={folderTreeQuery.data?.folders ?? []}
          documents={folderTreeQuery.data?.documents ?? []}
          onOpenVaultContextMenu={openVaultContextMenu}
        />
      </Box>
      {contextMenu ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getVaultContextMenuActions(contextVaultId)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Flex>
  );
}

function DefaultBreadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbEntry[] }) {
  const visibleBreadcrumbs = getVisibleBreadcrumbs(breadcrumbs);

  return (
    <Breadcrumb minW="0">
      <BreadcrumbList flexWrap="nowrap">
        {visibleBreadcrumbs.map((item, index) => {
          const isLast = index === visibleBreadcrumbs.length - 1;

          if (item === null) {
            return (
              <Fragment key="breadcrumb-ellipsis">
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem flexShrink={0}>
                  <Text aria-hidden="true" color="fg.muted">...</Text>
                </BreadcrumbItem>
              </Fragment>
            );
          }

          const label = truncateBreadcrumbLabel(item.label);

          return (
            <Fragment key={`${item.to ?? item.label}-${item.label}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem minW="0" flexShrink={isLast ? 1 : 0}>
                {item.to && !isLast ? (
                  <Link to={item.to} style={{ minWidth: 0, color: 'inherit' }}>
                    <Text title={item.label} truncate fontWeight="medium" transition="colors" _hover={{ color: 'fg' }}>
                      {label}
                    </Text>
                  </Link>
                ) : (
                  <BreadcrumbPage title={item.label} className="truncate">{label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function QuickSearchTrigger({
  shortcut,
  onOpen,
  size = 'md',
}: {
  shortcut: ReturnType<typeof getQuickSearchShortcut>;
  onOpen: () => void;
  size?: 'sm' | 'md';
}) {
  const kbdSize = size === 'sm' ? 'sm' : 'md';

  return (
    <ChakraButton
      type="button"
      aria-label={`Quick search, ${shortcut.label}`}
      aria-keyshortcuts="Meta+K"
      onClick={onOpen}
      variant="plain"
      justifyContent="center"
      h="var(--arkivra-controlHeight, 2.5rem)"
      minH="var(--arkivra-controlHeight, 2.5rem)"
      minW="var(--arkivra-controlHeight, 2.5rem)"
      gap="2"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.workspace"
      px={size === 'sm' ? '2' : '2.5'}
      color="fg.subtle"
      _hover={{ borderColor: 'border.strong', bg: 'bg.workspace', color: 'fg.muted' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
    >
      <HStack gap="1" aria-hidden="true">
        <Kbd size={kbdSize} flexShrink={0} color="fg.muted">
          {shortcut.modifier}
        </Kbd>
        <Kbd size={kbdSize} flexShrink={0} color="fg.muted">
          K
        </Kbd>
      </HStack>
    </ChakraButton>
  );
}

function PrimarySidebarToggle({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      type="button"
      aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      variant="ghost"
      color="fg.muted"
      flexShrink={0}
      onClick={onToggle}
    >
      {isExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
    </IconButton>
  );
}

function WorkspaceHeader({
  breadcrumbs,
  headerConfig,
  isPrimarySidebarExpanded,
  hasSecondarySidebar,
  isSecondarySidebarOpen,
  quickSearchShortcut,
  hideQuickSearch = false,
  onTogglePrimarySidebar,
  onToggleSecondarySidebar,
  onOpenQuickSearch,
}: {
  breadcrumbs: BreadcrumbEntry[];
  headerConfig: WorkspaceHeaderConfig | null;
  isPrimarySidebarExpanded: boolean;
  hasSecondarySidebar: boolean;
  isSecondarySidebarOpen: boolean;
  quickSearchShortcut: ReturnType<typeof getQuickSearchShortcut>;
  hideQuickSearch?: boolean;
  onTogglePrimarySidebar: () => void;
  onToggleSecondarySidebar: () => void;
  onOpenQuickSearch: () => void;
}) {
  if (headerConfig?.hidden) return null;
  const shouldShowQuickSearch = !hideQuickSearch;

  if (headerConfig?.content) {
    return (
      <Flex
        as="header"
        minH={{ base: '3.75rem', lg: '3.75rem' }}
        shrink={0}
        align="stretch"
        borderBottomWidth="1px"
        borderColor="border.surface"
        bg="bg.workspace"
        position="relative"
      >
        <Flex align="center" gap="1" px={{ base: '4', md: '5', lg: '4' }}>
          <PrimarySidebarToggle
            isExpanded={isPrimarySidebarExpanded}
            onToggle={onTogglePrimarySidebar}
          />
          {hasSecondarySidebar ? (
            <IconButton
              display={{ base: 'none', md: 'inline-flex' }}
              type="button"
              aria-label={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
              title={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
              variant="ghost"
              color="fg.muted"
              flexShrink={0}
              onClick={onToggleSecondarySidebar}
            >
              {isSecondarySidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </IconButton>
          ) : null}
        </Flex>
        <Box minW="0" flex="1">
          {headerConfig.content}
        </Box>
        {headerConfig.actions || shouldShowQuickSearch ? (
          <HStack px={{ base: '4', md: '5', lg: '4' }} gap="2" zIndex="1" flexShrink={0}>
            {headerConfig.actions}
            {shouldShowQuickSearch ? (
              <Box display={{ base: 'none', '2xl': 'block' }}>
                <QuickSearchTrigger shortcut={quickSearchShortcut} onOpen={onOpenQuickSearch} />
              </Box>
            ) : null}
          </HStack>
        ) : null}
      </Flex>
    );
  }

  return (
    <Flex
      as="header"
      h={{ base: '3.75rem', lg: '3.75rem' }}
      shrink={0}
      align="center"
      borderBottomWidth="1px"
      borderColor="border.surface"
      bg="bg.workspace"
      px={{ base: '4', md: '5', lg: '4' }}
      position="relative"
    >
      <Flex minW="0" flex="1" align="center" gap="3">
        <PrimarySidebarToggle
          isExpanded={isPrimarySidebarExpanded}
          onToggle={onTogglePrimarySidebar}
        />
        {hasSecondarySidebar ? (
          <IconButton
            display={{ base: 'none', md: 'inline-flex' }}
            type="button"
            aria-label={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
            title={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
            variant="ghost"
            color="fg.muted"
            flexShrink={0}
            onClick={onToggleSecondarySidebar}
          >
            {isSecondarySidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </IconButton>
        ) : null}
        <Box minW="0" flex="1">
          {headerConfig?.left ?? <DefaultBreadcrumbs breadcrumbs={breadcrumbs} />}
          {headerConfig?.meta ? (
            <Box mt="0.5" color="fg.muted">
              {headerConfig.meta}
            </Box>
          ) : null}
        </Box>
      </Flex>

      <HStack ml="4" gap="2" zIndex="1" flexShrink={0}>
        {headerConfig?.actions}
        {shouldShowQuickSearch ? (
          <Box display={{ base: 'none', xl: 'block' }}>
            <QuickSearchTrigger shortcut={quickSearchShortcut} onOpen={onOpenQuickSearch} />
          </Box>
        ) : null}
      </HStack>
    </Flex>
  );
}

function getSecondaryKind(pathname: string): 'vault' | 'chat' | 'settings' | 'admin' | 'standard' {
  const parts = pathname.split('/').filter(Boolean);
  if (isChatPath(pathname)) return 'chat';
  if (parts[0] === 'settings') return 'settings';
  if (parts[0] === 'admin') return 'admin';
  if (parts[0] === 'vaults' || pathname === ROUTES.vaults) return 'vault';
  return 'standard';
}

function shouldHideSecondarySidebar(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  return pathname === ROUTES.vaults
    || pathname === ROUTES.search
    || pathname === ROUTES.tags
    || pathname === ROUTES.transfers
    || isChatPath(pathname)
    || parts[0] === 'trash';
}

function isVaultSectionSegment(value: string | undefined) {
  return value === 'members' || value === 'activity' || value === 'settings' || value === 'chat';
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const uploadState = useUploadManagerState();
  const { data: sessionData } = authClient.useSession();
  const [searchValue, setSearchValue] = useState('');
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);
  const [secondaryContent, setSecondaryContent] = useState<ReactNode | null>(null);
  const [isPrimarySidebarExpanded, setIsPrimarySidebarExpanded] = useState(true);
  const [isSecondarySidebarOpen, setIsSecondarySidebarOpen] = useState(true);
  const [isTransfersDrawerOpen, setIsTransfersDrawerOpen] = useState(false);
  const previousLocationKeyRef = useRef<string | null>(null);
  const quickSearchShortcut = useMemo(() => getQuickSearchShortcut(), []);
  const debouncedSearchValue = useDebouncedValue(searchValue.trim(), QUICK_SEARCH_QUERY_DEBOUNCE_MS);
  const pathParts = location.pathname.split('/').filter(Boolean);
  const transferVaultId = useMemo(
    () => (location.search as Record<string, string | undefined>).vaultId ?? null,
    [location.search],
  );
  const currentFolderId = (location.search as Record<string, string | undefined>).folderId ?? null;
  const isChatRoute = isChatPath(location.pathname);
  const isVaultIndexRoute = location.pathname === ROUTES.vaults;
  const isVaultBrowserRoute = pathParts[0] === 'vaults' && pathParts.length === 2;
  const isAdminUsersRoute = location.pathname === ROUTES.adminUsers;
  const isFlushContentRoute =
    isVaultIndexRoute ||
    isVaultBrowserRoute ||
    isAdminUsersRoute ||
    location.pathname === ROUTES.tags ||
    location.pathname === ROUTES.search ||
    pathParts[0] === 'trash';
  const activeVaultId =
    pathParts[0] === 'vaults'
      ? pathParts[1]
      : transferVaultId;
  const activeDocumentRoute = useMemo(() => {
    if (pathParts[0] === 'vaults' && pathParts[2] && !isVaultSectionSegment(pathParts[2])) {
      return { vaultId: pathParts[1] ?? '', documentId: pathParts[2] ?? '' };
    }

    return null;
  }, [pathParts]);
  const activeVaultName = useMemo(
    () => (vaultsQuery.data?.vaults ?? []).find((vault) => vault.id === activeVaultId)?.name,
    [activeVaultId, vaultsQuery.data?.vaults],
  );
  const activeDocumentQuery = useDocumentQuery({
    vaultId: activeDocumentRoute?.vaultId ?? '',
    documentId: activeDocumentRoute?.documentId ?? '',
  });
  const breadcrumbs = useMemo(
    () =>
      buildBreadcrumbs({
        pathname: location.pathname,
        transferVaultId,
        vaultName: activeVaultName,
        documentName: activeDocumentQuery.data?.document.name,
      }),
    [activeDocumentQuery.data?.document.name, activeVaultName, location.pathname, transferVaultId],
  );
  const layoutContextValue = useMemo(
    () => ({ setHeaderConfig, setSecondaryContent }),
    [],
  );
  const quickSearchQuery = useGlobalSearchDocumentsQuery({
    query: debouncedSearchValue,
    pageIndex: 0,
    pageSize: 8,
    enabled: isQuickSearchOpen && debouncedSearchValue.length > 0,
  });
  async function handleSignOut() {
    await uploadManager.clearForLogout();
    await authClient.signOut();
  }

  function closeQuickSearch() {
    setSearchValue('');
    setIsQuickSearchOpen(false);
  }

  function openQuickSearch() {
    setIsQuickSearchOpen(true);
  }

  useEffect(() => {
    function handleQuickSearchShortcut(event: KeyboardEvent) {
      if (!event.metaKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setIsQuickSearchOpen(true);
    }

    window.addEventListener('keydown', handleQuickSearchShortcut);
    return () => window.removeEventListener('keydown', handleQuickSearchShortcut);
  }, []);

  useEffect(() => {
    function handleOpenTransfers() {
      setIsTransfersDrawerOpen(true);
    }

    window.addEventListener('arkivra:transfers-open', handleOpenTransfers);
    return () => window.removeEventListener('arkivra:transfers-open', handleOpenTransfers);
  }, []);

  useEffect(() => {
    const hasUnfinishedUploads = uploadState.items.some(item =>
      item.status === 'queued' || item.status === 'uploading' || item.status === 'paused',
    );

    if (!hasUnfinishedUploads) {
      return undefined;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [uploadState.items]);

  const locationKey = useMemo(
    () => `${location.pathname}:${JSON.stringify(location.search)}`,
    [location.pathname, location.search],
  );

  useEffect(() => {
    if (previousLocationKeyRef.current === null) {
      previousLocationKeyRef.current = locationKey;
      return;
    }

    if (previousLocationKeyRef.current !== locationKey) {
      previousLocationKeyRef.current = locationKey;
      setIsTransfersDrawerOpen(false);
    }
  }, [locationKey]);

  const secondaryKind = getSecondaryKind(location.pathname);
  const hideSecondarySidebar = shouldHideSecondarySidebar(location.pathname);
  const shouldShowVaultFileTreePanel = Boolean(activeVaultId) && (isVaultBrowserRoute || activeDocumentRoute !== null);
  const hasSecondarySidebar = !hideSecondarySidebar && secondaryContent !== null;
  const contentPadding = isChatRoute || isFlushContentRoute ? '0' : { base: '4', lg: '6' };
  const uploadCount = uploadState.activeCount + uploadState.queuedCount;
  const routeContent = (
    <>
      {uploadCount > 0 ? (
        <Box px={shouldShowVaultFileTreePanel ? '0' : contentPadding} pt={isChatRoute || isFlushContentRoute ? '3' : '4'}>
          <chakra.button
            type="button"
            display="flex"
            w="full"
            alignItems="center"
            justifyContent="space-between"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.workspace"
            px="4"
            py="3"
            fontSize="sm"
            color="fg.muted"
            transition="colors"
            _hover={{ bg: 'bg.workspaceMuted', color: 'fg' }}
            onClick={() => setIsTransfersDrawerOpen(true)}
          >
            <HStack gap="3">
              <Flex boxSize="8" align="center" justify="center" color="fg">
                <Upload size={16} />
              </Flex>
              <Text>
                Uploading {uploadCount} file
                {uploadCount === 1 ? '' : 's'}
              </Text>
            </HStack>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.12em">
              View queue
            </Text>
          </chakra.button>
        </Box>
      ) : null}
      <RouterDebugProbe />
      <Outlet />
    </>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <WorkspaceLayoutContext value={layoutContextValue}>
        <Flex minH="100vh" bg="bg.workspace" color="fg" overflow="hidden">
          <UnifiedSidebar
            expanded={isPrimarySidebarExpanded}
            activeNavId={isTransfersDrawerOpen ? 'transfers' : primaryNavId(location.pathname)}
            currentPathname={location.pathname}
            sessionAccountLabel={sessionData?.user.name?.trim() || sessionData?.user.email}
            isAdmin={meQuery.data?.isAdmin}
            onOpenTransfers={() => setIsTransfersDrawerOpen(true)}
            onSignOut={() => void handleSignOut()}
          />
          {hasSecondarySidebar ? (
            <SecondarySidebar
              kind={secondaryKind}
              isOpen={isSecondarySidebarOpen}
              customContent={secondaryContent}
              currentPathname={location.pathname}
            />
          ) : null}

          <Flex minW="0" flex="1" h="100vh" direction="column" overflow="hidden">
            <WorkspaceHeader
              breadcrumbs={breadcrumbs}
              headerConfig={isChatRoute ? { hidden: true } : headerConfig}
              isPrimarySidebarExpanded={isPrimarySidebarExpanded}
              hasSecondarySidebar={hasSecondarySidebar}
              isSecondarySidebarOpen={isSecondarySidebarOpen}
              quickSearchShortcut={quickSearchShortcut}
              hideQuickSearch={location.pathname === ROUTES.search}
              onTogglePrimarySidebar={() => setIsPrimarySidebarExpanded((expanded) => !expanded)}
              onToggleSecondarySidebar={() => setIsSecondarySidebarOpen((open) => !open)}
              onOpenQuickSearch={openQuickSearch}
            />

            <Box
              as="main"
              className="@container/main"
              flex="1"
              minH="0"
              overflow={shouldShowVaultFileTreePanel || isChatRoute || isFlushContentRoute ? 'hidden' : 'auto'}
              bg="bg.workspace"
              px={shouldShowVaultFileTreePanel ? '0' : contentPadding}
              py="0"
            >
              {shouldShowVaultFileTreePanel && activeVaultId ? (
                <Flex h="full" minH="0" minW="0" direction={{ base: 'column', md: 'row' }} overflow="hidden">
                  <VaultFileTreePanel
                    activeVaultId={activeVaultId}
                    currentFolderId={currentFolderId}
                    currentDocumentId={activeDocumentRoute?.documentId ?? null}
                  />
                  <Flex
                    minW="0"
                    flex="1"
                    direction="column"
                    overflow={isChatRoute || isFlushContentRoute ? 'hidden' : 'auto'}
                    px={contentPadding}
                  >
                    {routeContent}
                  </Flex>
                </Flex>
              ) : (
                routeContent
              )}
            </Box>
          </Flex>
        </Flex>

        <Dialog
          open={isQuickSearchOpen}
          onOpenChange={(open) => {
            if (open) {
              openQuickSearch();
              return;
            }

            closeQuickSearch();
          }}
        >
          <DialogContent
            hideCloseButton
            maxW="4xl"
            overflow="hidden"
            bg="bg.surface"
            p="0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Flex borderBottomWidth="1px" borderColor="border.surface" p={{ base: '4', sm: '5' }}>
              <HStack w="full" gap="3">
                <Box position="relative" flex="1">
                  <Box position="absolute" left="4" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none">
                    <Search size={16} />
                  </Box>
                  <Input
                    aria-label="Quick search modal"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search documents..."
                    pl="11"
                    pr="11"
                    borderColor="border.strong"
                    color="fg"
                    _placeholder={{ color: 'fg.muted' }}
                    _hover={{ borderColor: 'fg/30' }}
                    _focusVisible={{
                      borderColor: 'teal.solid',
                      outline: '2px solid',
                      outlineColor: 'teal.focusRing',
                      outlineOffset: '1px',
                    }}
                    autoFocus
                  />
                  {searchValue.length > 0 ? (
                    <IconButton
                      type="button"
                      aria-label="Clear search"
                      position="absolute"
                      right="3"
                      top="50%"
                      transform="translateY(-50%)"
                      variant="ghost"
                      h="8"
                      w="8"
                      rounded="md"
                      color="fg.muted"
                      _hover={{ bg: 'teal.subtle', color: 'fg' }}
                      onClick={() => setSearchValue('')}
                    >
                      <X size={16} />
                    </IconButton>
                  ) : null}
                </Box>
                <IconButton
                  type="button"
                  aria-label="Close search"
                  variant="outline"
                  h="10"
                  w="10"
                  rounded="md"
                  borderColor="border.surface"
                  bg="bg.surface"
                  color="fg.muted"
                  _hover={{ color: 'fg' }}
                  onClick={closeQuickSearch}
                >
                  <X size={16} />
                </IconButton>
              </HStack>
            </Flex>

            <Box maxH="70vh" overflowY="auto" p={{ base: '4', sm: '5' }}>
              {debouncedSearchValue.length === 0 ? (
                <AppEmptyState
                  title="Start typing to search"
                  description="Results will appear here without leaving the current page."
                  icon={<FileSearch size={24} />}
                  px="6"
                  py="16"
                />
              ) : quickSearchQuery.isLoading ? (
                <Text px="2" py="10" fontSize="sm" color="fg.muted">Searching documents...</Text>
              ) : quickSearchQuery.isError ? (
                <Text px="2" py="10" fontSize="sm" color="fg.error">Unable to run quick search.</Text>
              ) : (quickSearchQuery.data?.results.length ?? 0) === 0 ? (
                <AppEmptyState
                  title="No matching documents"
                  description="Try a different name, phrase, or keyword."
                  icon={<SearchX size={24} />}
                  px="6"
                  py="16"
                />
              ) : (
                <Stack gap="2">
                  {(quickSearchQuery.data?.results ?? []).map((result) => (
                    <Box
                      key={`${result.vaultId}-${result.documentId}`}
                      as="button"
                      w="full"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.surface"
                      px="4"
                      py="4"
                      textAlign="left"
                      transition="colors"
                      _hover={{ bg: 'bg.workspaceMuted' }}
                      onClick={() => {
                        closeQuickSearch();
                        navigate({ to: ROUTES.vaultDocument(result.vaultId, result.documentId) });
                      }}
                    >
                      <Flex direction={{ base: 'column', sm: 'row' }} gap="3" alignItems={{ base: 'stretch', sm: 'flex-start' }} justifyContent="space-between">
                        <Box minW="0">
                          <Flex align="center" gap="2">
                            <Text truncate fontSize="base" fontWeight="semibold" color="fg">{result.name}</Text>
                            <ArrowRight size={16} style={{ flexShrink: 0 }} />
                          </Flex>
                          <Text mt="1" fontSize="sm" color="fg.muted">
                            {result.vaultName} &bull; {result.mimeType} &bull; Updated {formatDate(result.updatedAt)}
                          </Text>
                          {result.bestChunk ? (
                            <Text mt="2" fontSize="sm" color="fg.muted">
                              {tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                                part.highlighted ? (
                                  <Box as="mark" key={`${result.documentId}-${part.key}`} rounded="sm" bg="teal.subtle" color="teal.fg" px="1">
                                    {part.text}
                                  </Box>
                                ) : (
                                  <Text as="span" key={`${result.documentId}-${part.key}`}>{part.text}</Text>
                                ),
                              )}
                            </Text>
                          ) : null}
                        </Box>
                        <Text flexShrink={0} fontSize="xs" textTransform="uppercase" letterSpacing="0.12em" color="fg.muted">
                          {result.bestChunk?.pageNumber !== null && result.bestChunk?.pageNumber !== undefined
                            ? `Page ${result.bestChunk.pageNumber}`
                            : 'Match'}
                        </Text>
                      </Flex>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </DialogContent>
        </Dialog>

        <TransfersDrawer
          open={isTransfersDrawerOpen}
          onOpenChange={setIsTransfersDrawerOpen}
        />
      </WorkspaceLayoutContext>
    </TooltipProvider>
  );
}

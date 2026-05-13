import type { ComponentType, FormEvent, ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Compass,
  FileSearch,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  Tags,
  Trash2,
  Upload,
  UserCircle2,
  Vault,
  X,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Box, Button as ChakraButton, Flex, HStack, IconButton, Input, Kbd, Menu, Portal, Stack, Text, Textarea, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArkivraLogo } from '@/components/brand/arkivra-logo';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { SecondaryNavLink } from '@/components/layout/secondary-nav-link';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { ROUTES } from '@/app/routes';
import { RouterDebugProbe } from '@/features/auth/auth-guards';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/features/documents/documents.utils';
import { useDocumentQuery } from '@/features/documents/documents.queries';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
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
  getVaultTreeVaultId,
} from '@/features/vaults/components/vault-sidebar-tree';
import { createVault } from '@/features/vaults/vaults.api';
import { useVaultsQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';

function getQuickSearchShortcutLabel() {
  if (typeof navigator === 'undefined') {
    return 'Super K';
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const isAppleDevice =
    platform.includes('mac') ||
    platform.includes('iphone') ||
    platform.includes('ipad') ||
    userAgent.includes('mac os');

  return isAppleDevice ? '⌘ K' : 'Super K';
}

interface BreadcrumbEntry {
  label: string;
  to?: string;
}

interface PrimaryNavItem {
  id: 'vaults' | 'chat' | 'search' | 'tags' | 'trash' | 'transfers';
  to: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

const primaryNavItems: PrimaryNavItem[] = [
  { id: 'vaults', to: ROUTES.vaults, label: 'Vaults', icon: Vault },
  { id: 'chat', to: ROUTES.chat, label: 'Chat', icon: MessageSquare },
  { id: 'search', to: ROUTES.search, label: 'Search', icon: Search },
  { id: 'tags', to: ROUTES.tags, label: 'Tags', icon: Tags },
  { id: 'trash', to: ROUTES.trash, label: 'Trash', icon: Trash2 },
  { id: 'transfers', to: ROUTES.transfers, label: 'Transfers', icon: Upload },
];

const QUICK_SEARCH_QUERY_DEBOUNCE_MS = 280;

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
  if (pathname === ROUTES.chat) return [{ label: 'Chat' }];
  if (pathname === ROUTES.trash) return [{ label: 'Trash' }];
  if (pathname === ROUTES.tags) return [{ label: 'Tags' }];
  if (pathname === ROUTES.search) return [{ label: 'Search' }];
  if (pathname === ROUTES.settings) return [{ label: 'Settings' }];
  if (pathname === ROUTES.admin) return [{ label: 'Admin' }];
  if (pathname === ROUTES.about) return [{ label: 'About' }];

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

function primaryNavId(pathname: string): PrimaryNavItem['id'] {
  const parts = pathname.split('/').filter(Boolean);

  if (pathname === ROUTES.chat || (parts[0] === 'vaults' && (parts[2] === 'chat' || parts[3] === 'chat'))) return 'chat';
  if (pathname === ROUTES.search) return 'search';
  if (pathname === ROUTES.tags) return 'tags';
  if (pathname === ROUTES.trash) return 'trash';
  if (pathname === ROUTES.transfers) return 'transfers';

  return 'vaults';
}

function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailLink({
  item,
  active,
  onOpenTransfers,
}: {
  item: PrimaryNavItem;
  active: boolean;
  onOpenTransfers: () => void;
}) {
  const Icon = item.icon;

  if (item.id === 'transfers') {
    return (
      <RailTooltip label={item.label}>
        <chakra.button
          type="button"
          aria-label={item.label}
          display="flex"
          boxSize="11"
          alignItems="center"
          justifyContent="center"
          rounded="lg"
          color={active ? 'fg' : 'fg.muted'}
          bg={active ? 'bg.sidebar' : 'transparent'}
          borderWidth="1px"
          borderColor={active ? 'border.subtle' : 'transparent'}
          cursor="pointer"
          transition="background-color 120ms ease, color 120ms ease"
          _hover={{ bg: active ? 'bg.sidebar' : 'bg.muted', color: 'fg' }}
          onClick={onOpenTransfers}
        >
          <Icon size={23} strokeWidth={2.1} />
        </chakra.button>
      </RailTooltip>
    );
  }

  return (
    <RailTooltip label={item.label}>
      <Link to={item.to} aria-label={item.label} style={{ color: 'inherit', textDecoration: 'none' }}>
        <Flex
          boxSize="11"
          align="center"
          justify="center"
          rounded="lg"
          color={active ? 'fg' : 'fg.muted'}
          bg={active ? 'bg.sidebar' : 'transparent'}
          borderWidth="1px"
          borderColor={active ? 'border.subtle' : 'transparent'}
          transition="background-color 120ms ease, color 120ms ease"
          _hover={{ bg: active ? 'bg.sidebar' : 'bg.muted', color: 'fg' }}
        >
          <Icon size={23} strokeWidth={2.1} />
        </Flex>
      </Link>
    </RailTooltip>
  );
}

function PrimarySidebar({
  activeNavId,
  sessionEmail,
  isGlobalAdmin,
  onOpenTransfers,
  onSignOut,
}: {
  activeNavId: PrimaryNavItem['id'];
  sessionEmail?: string | null;
  isGlobalAdmin?: boolean;
  onOpenTransfers: () => void;
  onSignOut: () => void;
}) {
  return (
    <Flex
      as="aside"
      w="4.75rem"
      h="100vh"
      shrink={0}
      direction="column"
      align="center"
      borderRightWidth="1px"
      borderColor="border.subtle"
      bg="bg.rail"
      py="4"
    >
      <RailTooltip label="Arkivra">
        <Link to={ROUTES.vaults} aria-label="Arkivra" style={{ color: 'inherit' }}>
          <Flex
            boxSize="11"
            align="center"
            justify="center"
            rounded="lg"
            bg="bg.sidebar"
            color="teal.fg"
            borderWidth="1px"
            borderColor="border.subtle"
          >
            <ArkivraLogo boxSize="10" />
          </Flex>
        </Link>
      </RailTooltip>

      <Stack as="nav" aria-label="Primary" gap="2.5" mt="7" align="center">
        {primaryNavItems.map((item) => (
          <RailLink key={item.id} item={item} active={activeNavId === item.id} onOpenTransfers={onOpenTransfers} />
        ))}
      </Stack>

      <Stack mt="auto" gap="2.5" align="center">
        <RailTooltip label="Toggle color theme">
          <Box>
            <ThemeToggle />
          </Box>
        </RailTooltip>

        <Menu.Root lazyMount unmountOnExit typeahead={false} positioning={{ placement: 'right-end' }}>
          <Menu.Trigger asChild>
            <chakra.button
              type="button"
              aria-label="Open account menu"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxSize="11"
              rounded="lg"
              color="fg.muted"
              borderWidth="1px"
              borderColor="border.subtle"
              bg="bg.sidebar"
              cursor="pointer"
              _hover={{ color: 'fg', bg: 'bg.muted' }}
            >
              <UserCircle2 size={22} />
            </chakra.button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content
                minW="60"
                overflow="hidden"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.surface"
                p="1.5"
                shadow="lg"
              >
                <Box px="3" py="2">
                  <Text fontWeight="medium" color="fg">
                    {sessionEmail ?? 'Signed in'}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {isGlobalAdmin ? 'Admin' : 'Vault member'}
                  </Text>
                </Box>
                <Menu.Separator />
                <Menu.Item value="account-settings" asChild {...accountMenuItemProps}>
                  <Link to={ROUTES.settings}>
                    <Settings size={16} />
                    Account settings
                  </Link>
                </Menu.Item>
                {isGlobalAdmin ? (
                  <Menu.Item value="admin" asChild {...accountMenuItemProps}>
                    <Link to={ROUTES.admin}>
                      <ShieldCheck size={16} />
                      Admin
                    </Link>
                  </Menu.Item>
                ) : null}
                <Menu.Item value="about" asChild {...accountMenuItemProps}>
                  <Link to={ROUTES.about}>
                    <Compass size={16} />
                    About
                  </Link>
                </Menu.Item>
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

function SecondarySidebar({
  title,
  kind,
  activeVaultId,
  currentFolderId,
  currentDocumentId,
  customContent,
  canCreateVault,
  onCreateVault,
}: {
  title: string;
  kind: 'vault' | 'chat' | 'standard';
  activeVaultId?: string | null;
  currentFolderId: string | null;
  currentDocumentId?: string | null;
  customContent: ReactNode | null;
  canCreateVault?: boolean;
  onCreateVault?: () => void;
}) {
  const vaultsQuery = useVaultsQuery();
  const [vaultTreeExpandedValue, setVaultTreeExpandedValue] = useState<string[]>([VAULT_TREE_ROOT_VALUE]);
  const expandedTreeVaultId = useMemo(
    () => vaultTreeExpandedValue.map(getVaultTreeVaultId).find(vaultId => vaultId !== null) ?? null,
    [vaultTreeExpandedValue],
  );
  const treeVaultId = activeVaultId ?? expandedTreeVaultId;
  const folderTreeQuery = useFolderTreeQuery({
    vaultId: treeVaultId ?? '',
    enabled: kind === 'vault' && Boolean(treeVaultId),
  });
  const vaults = vaultsQuery.data?.vaults ?? [];

  return (
    <Flex
      as="aside"
      aria-label="Secondary"
      display={{ base: 'none', md: 'flex' }}
      w={{ md: '17rem', xl: '18.5rem' }}
      h="100vh"
      shrink={0}
      direction="column"
      borderRightWidth="1px"
      borderColor="border.subtle"
      bg="bg.sidebar"
      overflow="hidden"
    >
      <Flex h="3.5rem" align="center" borderBottomWidth="1px" borderColor="border.subtle" px="5">
        <Text truncate fontSize="xl" fontWeight="medium" color="fg">
          {title}
        </Text>
      </Flex>

      <Box
        flex="1"
        minH="0"
        overflowY={kind === 'vault' && customContent === null ? 'hidden' : 'auto'}
        px="3"
        py="4"
        display={kind === 'vault' && customContent === null ? 'flex' : undefined}
        flexDirection={kind === 'vault' && customContent === null ? 'column' : undefined}
      >
        {kind === 'vault' ? (
          customContent ? (
            <Stack gap="4">
              {canCreateVault ? (
                <ChakraButton
                  type="button"
                  size="sm"
                  h="9"
                  w="full"
                  justifyContent="flex-start"
                  rounded="md"
                  colorPalette="teal"
                  onClick={onCreateVault}
                >
                  <Plus size={16} />
                  Create vault
                </ChakraButton>
              ) : null}
              {customContent}
            </Stack>
          ) : (
            <Flex direction="column" gap="4" minH="0" flex="1">
              {canCreateVault ? (
                <ChakraButton
                  type="button"
                  size="sm"
                  h="9"
                  w="full"
                  justifyContent="flex-start"
                  rounded="md"
                  colorPalette="teal"
                  onClick={onCreateVault}
                >
                  <Plus size={16} />
                  Create vault
                </ChakraButton>
              ) : null}
              <Box flex="1" minH="0" overflowY="auto" pr="1" mr="-1">
                <VaultSidebarTree
                  vaults={vaults}
                  activeVaultId={treeVaultId}
                  expandedValue={vaultTreeExpandedValue}
                  onExpandedValueChange={setVaultTreeExpandedValue}
                  currentFolderId={currentFolderId}
                  currentDocumentId={currentDocumentId}
                  folders={folderTreeQuery.data?.folders ?? []}
                  documents={folderTreeQuery.data?.documents ?? []}
                />
              </Box>
            </Flex>
          )
        ) : customContent ?? (
          kind === 'chat' ? (
            <Text px="2" py="4" fontSize="sm" color="fg.muted">
              Open a chat to see conversation history.
            </Text>
          ) : (
            <Stack gap="1">
              <SecondaryNavLink to={ROUTES.settings} label="Settings" icon={<Settings size={16} />} />
              <SecondaryNavLink to={ROUTES.about} label="About" icon={<Compass size={16} />} />
            </Stack>
          )
        )}
      </Box>
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

function WorkspaceHeader({
  breadcrumbs,
  headerConfig,
  quickSearchShortcutLabel,
  onOpenQuickSearch,
}: {
  breadcrumbs: BreadcrumbEntry[];
  headerConfig: WorkspaceHeaderConfig | null;
  quickSearchShortcutLabel: string;
  onOpenQuickSearch: () => void;
}) {
  if (headerConfig?.hidden) return null;

  return (
    <Flex
      as="header"
      h="3.5rem"
      shrink={0}
      align="center"
      borderBottomWidth="1px"
      borderColor="border.subtle"
      bg="bg.workspace"
      px={{ base: '4', md: '5' }}
    >
      <Flex minW="0" flex="1" align="center" gap="3">
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
        <ChakraButton
          display={{ base: 'none', lg: 'inline-flex' }}
          type="button"
          aria-label={`Quick search, ${quickSearchShortcutLabel}`}
          aria-keyshortcuts="Meta+K"
          onClick={onOpenQuickSearch}
          variant="plain"
          justifyContent="flex-start"
          w={{ lg: '13rem', xl: '15rem' }}
          h="9"
          gap="2.5"
          rounded="md"
          borderWidth="1px"
          borderColor="border.subtle"
          bg="bg.workspace"
          px="3"
          color="fg.subtle"
          _hover={{ borderColor: 'border.strong', color: 'fg.muted' }}
          _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
        >
          <Search size={18} strokeWidth={2} />
          <Text flex="1" minW="0" textAlign="left" truncate fontSize="sm" fontWeight="medium">
            Quick search...
          </Text>
          <Kbd size="md" flexShrink={0} color="fg.muted" aria-hidden="true">
            super+k
          </Kbd>
        </ChakraButton>

        <IconButton
          display={{ base: 'inline-flex', lg: 'none' }}
          type="button"
          aria-label={`Quick search, ${quickSearchShortcutLabel}`}
          variant="ghost"
          color="fg.muted"
          onClick={onOpenQuickSearch}
        >
          <Search size={18} />
        </IconButton>
      </HStack>
    </Flex>
  );
}

function getSecondaryKind(pathname: string): 'vault' | 'chat' | 'standard' {
  const parts = pathname.split('/').filter(Boolean);
  if (pathname === ROUTES.chat || (parts[0] === 'vaults' && (parts[2] === 'chat' || parts[3] === 'chat'))) return 'chat';
  if (parts[0] === 'vaults' || pathname === ROUTES.vaults) return 'vault';
  return 'standard';
}

function shouldHideSecondarySidebar(pathname: string) {
  return pathname === ROUTES.search || pathname === ROUTES.tags || pathname === ROUTES.trash;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const uploadState = useUploadManagerState();
  const { data: sessionData } = authClient.useSession();
  const [searchValue, setSearchValue] = useState('');
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [isCreateVaultOpen, setIsCreateVaultOpen] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultDescription, setNewVaultDescription] = useState('');
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);
  const [secondaryContent, setSecondaryContent] = useState<ReactNode | null>(null);
  const [isTransfersDrawerOpen, setIsTransfersDrawerOpen] = useState(false);
  const previousLocationKeyRef = useRef<string | null>(null);
  const quickSearchShortcutLabel = useMemo(() => getQuickSearchShortcutLabel(), []);
  const debouncedSearchValue = useDebouncedValue(searchValue.trim(), QUICK_SEARCH_QUERY_DEBOUNCE_MS);
  const pathParts = location.pathname.split('/').filter(Boolean);
  const transferVaultId = useMemo(
    () => (location.search as Record<string, string | undefined>).vaultId ?? null,
    [location.search],
  );
  const currentFolderId = (location.search as Record<string, string | undefined>).folderId ?? null;
  const isChatRoute =
    location.pathname === ROUTES.chat || (pathParts[0] === 'vaults' && (pathParts[2] === 'chat' || pathParts[3] === 'chat'));
  const isVaultIndexRoute = location.pathname === ROUTES.vaults;
  const isVaultBrowserRoute = pathParts[0] === 'vaults' && pathParts.length === 2;
  const isFlushContentRoute =
    isVaultIndexRoute ||
    isVaultBrowserRoute ||
    location.pathname === ROUTES.tags ||
    location.pathname === ROUTES.search;
  const activeVaultId =
    pathParts[0] === 'vaults'
      ? pathParts[1]
      : transferVaultId;
  const activeDocumentRoute = useMemo(() => {
    if (pathParts[0] === 'vaults' && pathParts[2] && !['settings', 'chat'].includes(pathParts[2])) {
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
  const createVaultMutation = useMutation({
    mutationFn: createVault,
    onSuccess: async ({ vault }) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      setIsCreateVaultOpen(false);
      setNewVaultName('');
      setNewVaultDescription('');
      toast.success('Vault created.');
      navigate({ to: ROUTES.vaultSettings(vault.id) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create vault.');
    },
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

  function closeCreateVault() {
    if (createVaultMutation.isPending) return;

    setIsCreateVaultOpen(false);
    setNewVaultName('');
    setNewVaultDescription('');
  }

  function handleCreateVaultSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (meQuery.data?.canCreateVault !== true) {
      toast.error('A global admin must grant vault creation before this account can create a workspace.');
      return;
    }

    const normalizedName = newVaultName.trim();
    if (!normalizedName) {
      toast.error('Vault name is required.');
      return;
    }

    createVaultMutation.mutate({
      name: normalizedName,
      description: newVaultDescription.trim() || null,
    });
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
  const contentPadding = isChatRoute || isFlushContentRoute ? '0' : { base: '4', lg: '6' };

  return (
    <TooltipProvider delayDuration={100}>
      <WorkspaceLayoutContext value={layoutContextValue}>
        <Flex minH="100vh" bg="bg.workspace" color="fg" overflow="hidden">
          <PrimarySidebar
            activeNavId={isTransfersDrawerOpen ? 'transfers' : primaryNavId(location.pathname)}
            sessionEmail={sessionData?.user.email}
            isGlobalAdmin={meQuery.data?.isGlobalAdmin}
            onOpenTransfers={() => setIsTransfersDrawerOpen(true)}
            onSignOut={() => void handleSignOut()}
          />
          {hideSecondarySidebar ? null : (
            <SecondarySidebar
              title={secondaryKind === 'chat' ? 'Chat' : 'Arkivra'}
              kind={secondaryKind}
              activeVaultId={activeVaultId}
              currentFolderId={currentFolderId}
              currentDocumentId={activeDocumentRoute?.documentId ?? null}
              customContent={secondaryContent}
              canCreateVault={meQuery.data?.canCreateVault === true}
              onCreateVault={() => setIsCreateVaultOpen(true)}
            />
          )}

          <Flex minW="0" flex="1" h="100vh" direction="column" overflow="hidden">
            <WorkspaceHeader
              breadcrumbs={breadcrumbs}
              headerConfig={isChatRoute ? { hidden: true } : headerConfig}
              quickSearchShortcutLabel={quickSearchShortcutLabel}
              onOpenQuickSearch={openQuickSearch}
            />

            <Box
              as="main"
              className="@container/main"
              flex="1"
              minH="0"
              overflow={isChatRoute || isFlushContentRoute ? 'hidden' : 'auto'}
              bg="bg.workspace"
              px={contentPadding}
              py="0"
            >
              {uploadState.activeCount + uploadState.queuedCount > 0 ? (
                <Box px={contentPadding} pt={isChatRoute || isFlushContentRoute ? '3' : '4'}>
                  <chakra.button
                    type="button"
                    display="flex"
                    w="full"
                    alignItems="center"
                    justifyContent="space-between"
                    borderWidth="1px"
                    borderColor="border.subtle"
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
                        Uploading {uploadState.activeCount + uploadState.queuedCount} file
                        {uploadState.activeCount + uploadState.queuedCount === 1 ? '' : 's'}
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
            <Flex borderBottomWidth="1px" borderColor="border.subtle" p={{ base: '4', sm: '5' }}>
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
                  borderColor="border.subtle"
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
                <Stack align="center" justify="center" gap="3" px="6" py="16" textAlign="center">
                  <Flex boxSize="12" align="center" justify="center" rounded="md" bg="bg.subtle" color="teal.solid">
                    <FileSearch size={20} />
                  </Flex>
                  <Box>
                    <Text fontWeight="medium" color="fg">Start typing to search</Text>
                    <Text mt="1" fontSize="sm" color="fg.muted">
                      Results will appear here without leaving the current page.
                    </Text>
                  </Box>
                </Stack>
              ) : quickSearchQuery.isLoading ? (
                <Text px="2" py="10" fontSize="sm" color="fg.muted">Searching documents...</Text>
              ) : quickSearchQuery.isError ? (
                <Text px="2" py="10" fontSize="sm" color="fg.error">Unable to run quick search.</Text>
              ) : (quickSearchQuery.data?.results.length ?? 0) === 0 ? (
                <Stack align="center" justify="center" gap="3" px="6" py="16" textAlign="center">
                  <Flex boxSize="12" align="center" justify="center" rounded="md" bg="bg.subtle" color="fg.muted">
                    <SearchX size={20} />
                  </Flex>
                  <Box>
                    <Text fontWeight="medium" color="fg">No matching documents</Text>
                    <Text mt="1" fontSize="sm" color="fg.muted">Try a different name, phrase, or keyword.</Text>
                  </Box>
                </Stack>
              ) : (
                <Stack gap="2">
                  {(quickSearchQuery.data?.results ?? []).map((result) => (
                    <Box
                      key={`${result.vaultId}-${result.documentId}`}
                      as="button"
                      w="full"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.subtle"
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
        <Dialog
          open={isCreateVaultOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsCreateVaultOpen(true);
              return;
            }

            closeCreateVault();
          }}
        >
          <DialogContent maxW="lg" overflow="hidden" bg="bg.surface" p="0">
            <Box borderBottomWidth="1px" borderColor="border.subtle" px="5" py="4">
              <Text fontSize="lg" fontWeight="semibold" color="fg">
                New vault
              </Text>
            </Box>
            <chakra.form style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }} onSubmit={handleCreateVaultSubmit}>
              <Stack gap="2">
                <chakra.label htmlFor="shell-create-vault-name" fontSize="sm" fontWeight="medium" color="fg">
                  Name
                </chakra.label>
                <Input
                  id="shell-create-vault-name"
                  type="text"
                  required
                  autoFocus
                  value={newVaultName}
                  onChange={(event) => setNewVaultName(event.target.value)}
                  placeholder="Personal Vault"
                />
              </Stack>

              <Stack gap="2">
                <chakra.label htmlFor="shell-create-vault-description" fontSize="sm" fontWeight="medium" color="fg">
                  Description
                </chakra.label>
                <Textarea
                  id="shell-create-vault-description"
                  value={newVaultDescription}
                  onChange={(event) => setNewVaultDescription(event.target.value)}
                  minH="6rem"
                  resize="vertical"
                  placeholder="Optional"
                />
                <Text fontSize="xs" color="fg.muted">
                  Optional context to help identify this vault later.
                </Text>
              </Stack>

              <Flex justify="flex-end" gap="3" pt="2">
                <ChakraButton
                  type="button"
                  variant="outline"
                  disabled={createVaultMutation.isPending}
                  onClick={closeCreateVault}
                >
                  Cancel
                </ChakraButton>
                <ChakraButton type="submit" colorPalette="teal" disabled={createVaultMutation.isPending}>
                  <Plus size={16} />
                  {createVaultMutation.isPending ? 'Creating...' : 'Create vault'}
                </ChakraButton>
              </Flex>
            </chakra.form>
          </DialogContent>
        </Dialog>
      </WorkspaceLayoutContext>
    </TooltipProvider>
  );
}

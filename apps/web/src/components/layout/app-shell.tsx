import type { CSSProperties, PropsWithChildren } from 'react';
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Compass,
  File,
  FileSearch,
  LogOut,
  MessageSquare,
  SearchX,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Trash2,
  Upload,
  UserCircle2,
  Vault,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Box, Flex, HStack, Stack, Text, Input, IconButton } from '@chakra-ui/react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { formatDate } from '@/features/documents/documents.utils';
import { useDocumentQuery } from '@/features/documents/documents.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useUploadManagerState } from '@/features/uploads/use-upload-manager';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { authClient } from '@/lib/auth-client';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'arkivra.sidebarCollapsed';

function getStoredSidebarCollapsedValue() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage?.getItem?.(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistSidebarCollapsedValue(isCollapsed: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem?.(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? 'true' : 'false');
  } catch {}
}

interface BreadcrumbEntry {
  label: string;
  to?: string;
}

function truncateBreadcrumbLabel(label: string, maxLength = 36) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 3).trimEnd()}...`;
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
  const currentDocumentLabel = truncateBreadcrumbLabel(documentName ?? 'Document');

  if (parts.length === 0) {
    return [{ label: 'Vaults' }];
  }

  if (pathname === '/vaults') {
    return [{ label: 'Vaults' }];
  }

  if (pathname === '/documents') {
    return [{ label: 'All Documents' }];
  }

  if (pathname === '/chat') {
    return [{ label: 'Chat' }];
  }

  if (pathname === '/documents/trash') {
    return [{ label: 'All Documents', to: '/documents' }, { label: 'Trash' }];
  }

  if (parts[0] === 'documents' && parts[1] && parts[2]) {
    return [{ label: 'All Documents', to: '/documents' }, { label: currentDocumentLabel }];
  }

  if (pathname === '/tags') {
    return [{ label: 'Tags' }];
  }

  if (pathname === '/transfers') {
    if (transferVaultId) {
      return [
        { label: 'Vaults', to: '/vaults' },
        { label: vaultName ?? 'Vault', to: `/vaults/${transferVaultId}/documents` },
        { label: 'Upload' },
      ];
    }

    return [{ label: 'All Documents', to: '/documents' }, { label: 'Upload' }];
  }

  if (pathname === '/search') {
    return [{ label: 'All Documents', to: '/documents' }, { label: 'Search' }];
  }

  if (pathname === '/settings') {
    return [{ label: 'Settings' }];
  }

  if (pathname === '/admin') {
    return [{ label: 'Admin' }];
  }

  if (pathname === '/about') {
    return [{ label: 'About' }];
  }

  if (parts[0] === 'vaults' && parts[1]) {
    const vaultLabel = vaultName ?? 'Vault';
    const vaultDocumentsPath = `/vaults/${parts[1]}/documents`;
    const base: BreadcrumbEntry[] = [
      { label: 'Vaults', to: '/vaults' },
      { label: vaultLabel, to: vaultDocumentsPath },
    ];

    if (parts[2] === 'settings') {
      return [...base, { label: 'Settings' }];
    }

    if (parts[2] === 'tags') {
      return [...base, { label: 'Tags' }];
    }

    if (parts[2] === 'chat') {
      return [...base, { label: 'Chat' }];
    }

    if (parts[2] === 'documents' && parts[3] === 'trash') {
      return [...base, { label: 'Trash' }];
    }

    if (parts[2] === 'documents' && parts[3] && parts[4] === 'chat') {
      return [...base, { label: currentDocumentLabel }, { label: 'Chat' }];
    }

    if (parts[2] === 'documents' && parts[3]) {
      return [...base, { label: currentDocumentLabel }];
    }

    if (parts[2] === 'documents') {
      return base;
    }

    return base;
  }

  return [{ label: 'Arkivra' }];
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const uploadState = useUploadManagerState();
  const { data: sessionData } = authClient.useSession();
  const [searchValue, setSearchValue] = useState('');
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return getStoredSidebarCollapsedValue();
  });
  const deferredSearchValue = useDeferredValue(searchValue.trim());
  const transferVaultId = useMemo(
    () => new URLSearchParams(location.search).get('vaultId'),
    [location.search],
  );
  const pathParts = location.pathname.split('/').filter(Boolean);
  const isStandaloneChatRoute =
    location.pathname === '/chat' || (pathParts[0] === 'vaults' && pathParts[2] === 'chat');
  const activeVaultId =
    pathParts[0] === 'vaults'
      ? pathParts[1]
      : pathParts[0] === 'documents' && pathParts.length >= 3
        ? pathParts[1]
        : transferVaultId;
  const activeDocumentRoute = useMemo(() => {
    if (pathParts[0] === 'vaults' && pathParts[2] === 'documents' && pathParts[3]) {
      return { vaultId: pathParts[1] ?? '', documentId: pathParts[3] ?? '' };
    }

    if (pathParts[0] === 'documents' && pathParts[1] && pathParts[2]) {
      return { vaultId: pathParts[1], documentId: pathParts[2] };
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

  useEffect(() => {
    persistSidebarCollapsedValue(isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  const { primaryNavItems, footerNavItems } = useMemo(() => {
    const primaryItems = [
      { to: '/vaults', label: 'Vaults', icon: Vault },
      { to: '/chat', label: 'Chat', icon: MessageSquare },
      { to: '/documents', label: 'All Documents', icon: File },
      { to: '/tags', label: 'Tags', icon: Tags },
      { to: '/transfers', label: 'Transfers', icon: Upload },
      { to: '/documents/trash', label: 'Trash', icon: Trash2 },
    ];
    const secondaryItems = [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/about', label: 'About', icon: Compass },
    ];

    if (meQuery.data?.isGlobalAdmin) {
      secondaryItems.splice(1, 0, { to: '/admin', label: 'Admin', icon: ShieldCheck });
    }

    return {
      primaryNavItems: primaryItems,
      footerNavItems: secondaryItems,
    };
  }, [meQuery.data?.isGlobalAdmin]);

  const quickSearchQuery = useGlobalSearchDocumentsQuery({
    query: deferredSearchValue,
    pageIndex: 0,
    pageSize: 8,
    enabled: isQuickSearchOpen && deferredSearchValue.length > 0,
  });

  function closeQuickSearch() {
    setSearchValue('');
    setIsQuickSearchOpen(false);
  }

  function openQuickSearch() {
    setIsQuickSearchOpen(true);
  }

  return (
    <Box minH="100vh" bg="bg.muted" color="fg">
      <SidebarProvider
        open={!isSidebarCollapsed}
        onOpenChange={(open) => setIsSidebarCollapsed(!open)}
        style={
          {
            '--sidebar-width': '17rem',
            '--sidebar-width-icon': '4.75rem',
            '--header-height': '3.5rem',
          } as CSSProperties
        }
      >
        <AppSidebar
          variant="default"
          primaryNavItems={primaryNavItems}
          footerNavItems={footerNavItems}
        />

        <SidebarInset h="100vh" minH="0" overflow="hidden">
          <Flex
            as="header"
            position="sticky"
            top="0"
            zIndex={40}
            h={isSidebarCollapsed ? '12' : 'var(--header-height)'}
            shrink={0}
            align="center"
            borderBottomWidth="1px"
            borderColor="border.subtle"
            bg="bg.panel"
            backdropFilter="blur(4px)"
            transition="width,height 200ms ease-linear"
          >
            <Flex w="full" align="center" gap="2" px={{ base: '4', lg: '6' }}>
              <SidebarTrigger ml="-1" />
              <Separator
                orientation="vertical"
                display={{ base: 'none', lg: 'block' }}
                h="4"
              />
              <Breadcrumb minW="0">
                <BreadcrumbList flexWrap="nowrap">
                  {breadcrumbs.map((item, index) => {
                    const isLast = index === breadcrumbs.length - 1;

                    return (
                      <Fragment key={`${item.to ?? item.label}-${item.label}`}>
                        {index > 0 ? <BreadcrumbSeparator /> : null}
                        <BreadcrumbItem minW="0">
                          {item.to && !isLast ? (
                            <Link
                              to={item.to}
                              style={{ color: 'inherit' }}
                            >
                              <Text truncate fontWeight="medium" transition="colors" _hover={{ color: 'fg' }}>
                                {item.label}
                              </Text>
                            </Link>
                          ) : (
                            <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>

              <HStack ml="auto" display={{ base: 'none', md: 'flex' }} maxW="sm" w="full" gap="2">
                <Box position="relative" flex="1">
                  <Box
                    position="absolute"
                    left="3"
                    top="50%"
                    transform="translateY(-50%)"
                    color="fg.muted"
                    pointerEvents="none"
                  >
                    <Search size={16} />
                  </Box>
                  <Input
                    aria-label="Global search"
                    placeholder="Quick search"
                    readOnly
                    onFocus={openQuickSearch}
                    onClick={openQuickSearch}
                    h="9"
                    rounded="md"
                    bg="bg.subtle"
                    pl="9"
                    borderColor="border.subtle"
                    color="fg"
                    _placeholder={{ color: 'fg.muted' }}
                  />
                </Box>
              </HStack>

              <HStack ml="auto" gap="2" md={{ ml: '0' }}>
                <ThemeToggle />

                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Open account menu"
                      className="h-9 w-9 cursor-pointer flex items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                    >
                      <UserCircle2 size={18} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" minW="56">
                    <DropdownMenuLabel style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                      <Text fontWeight="medium" color="fg">
                        {sessionData?.user.email ?? 'Signed in'}
                      </Text>
                      <Text fontSize="xs" color="fg.muted">
                        {meQuery.data?.isGlobalAdmin ? 'Admin' : 'Vault member'}
                      </Text>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <NavLink to="/settings">
                        <Settings size={16} />
                        Account settings
                      </NavLink>
                    </DropdownMenuItem>
                    {meQuery.data?.isGlobalAdmin ? (
                      <DropdownMenuItem asChild>
                        <NavLink to="/admin">
                          <ShieldCheck size={16} />
                          Admin
                        </NavLink>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => {
                        void authClient.signOut();
                      }}
                    >
                      <LogOut size={16} />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </HStack>
            </Flex>
          </Flex>

          <Flex minH="0" flex="1" direction="column">
            <Flex className="@container/main" minH="0" flex="1" direction="column" gap="2">
              <Stack
                minH="0"
                flex="1"
                gap={{ base: '4', md: '6' }}
                pt={isStandaloneChatRoute ? '4' : undefined}
                py={isStandaloneChatRoute ? undefined : { base: '4', md: '6' }}
              >
                {uploadState.activeCount + uploadState.queuedCount > 0 ? (
                  <Box px={{ base: '4', lg: '6' }}>
                    <NavLink
                      to="/transfers"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      <Flex
                        align="center"
                        justify="space-between"
                        rounded="xl"
                        borderWidth="1px"
                        borderColor="border.subtle"
                        bg="bg.panel"
                        px="4"
                        py="3"
                        fontSize="sm"
                        color="fg.muted"
                        shadow="sm"
                        transition="colors"
                        _hover={{ bg: 'teal.subtle', color: 'fg' }}
                      >
                        <HStack gap="3">
                          <Flex
                            boxSize="9"
                            align="center"
                            justify="center"
                            rounded="lg"
                            bg="bg.subtle"
                            color="fg"
                          >
                            <Upload size={16} />
                          </Flex>
                          <Text>
                            Uploading {uploadState.activeCount + uploadState.queuedCount} file
                            {uploadState.activeCount + uploadState.queuedCount === 1 ? '' : 's'}
                          </Text>
                        </HStack>
                        <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.16em">
                          View queue
                        </Text>
                      </Flex>
                    </NavLink>
                  </Box>
                ) : null}

                <Stack gap="3" px="4" display={{ base: 'flex', lg: 'none' }}>
                  <Box position="relative">
                    <Box
                      position="absolute"
                      left="4"
                      top="50%"
                      transform="translateY(-50%)"
                      color="fg.muted"
                      pointerEvents="none"
                    >
                      <Search size={16} />
                    </Box>
                    <Input
                      aria-label="Global search"
                      placeholder="Quick search"
                      readOnly
                      onFocus={openQuickSearch}
                      onClick={openQuickSearch}
                      pl="11"
                      borderColor="border.subtle"
                      color="fg"
                      _placeholder={{ color: 'fg.muted' }}
                    />
                  </Box>

                  <HStack gap="2" overflowX="auto">
                    {[...primaryNavItems, ...footerNavItems].map((item) => {
                      const IconComponent = item.icon;

                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/documents'}
                          style={{ color: 'inherit', textDecoration: 'none', flexShrink: 0 }}
                        >
                          {({ isActive }) => (
                            <Flex
                              align="center"
                              gap="2"
                              rounded="lg"
                              borderWidth="1px"
                              borderColor="border.subtle"
                              bg={isActive ? 'teal.subtle' : 'bg.panel'}
                              color={isActive ? 'fg' : 'fg.muted'}
                              px="3"
                              py="2"
                              fontSize="sm"
                              fontWeight="medium"
                              whiteSpace="nowrap"
                              transition="colors"
                              _hover={{ bg: 'teal.subtle', color: 'fg' }}
                            >
                              <Flex boxSize="4" shrink="0" align="center" justify="center">
                                <IconComponent size={16} />
                              </Flex>
                              <Text>{item.label}</Text>
                            </Flex>
                          )}
                        </NavLink>
                      );
                    })}
                  </HStack>
                </Stack>

                <Box
                  as="main"
                  flex="1"
                  minH="0"
                  px={{ base: '4', lg: '6' }}
                  overflow={isStandaloneChatRoute ? 'hidden' : 'auto'}
                  pb={isStandaloneChatRoute ? '0' : { base: '4', lg: '6' }}
                >
                  {children}
                </Box>
              </Stack>
            </Flex>
          </Flex>
        </SidebarInset>
      </SidebarProvider>
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
          bg="bg.panel"
          p="0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <Flex
            borderBottomWidth="1px"
            borderColor="border.subtle"
            p={{ base: '4', sm: '5' }}
          >
            <HStack w="full" gap="3">
              <Box position="relative" flex="1">
                <Box
                  position="absolute"
                  left="4"
                  top="50%"
                  transform="translateY(-50%)"
                  color="fg.muted"
                  pointerEvents="none"
                >
                  <Search size={16} />
                </Box>
                <Input
                  aria-label="Quick search modal"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search across all accessible documents..."
                  pl="11"
                  pr="11"
                  borderColor="border.subtle"
                  color="fg"
                  _placeholder={{ color: 'fg.muted' }}
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
                    rounded="lg"
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
                rounded="lg"
                borderColor="border.subtle"
                bg="bg.panel"
                color="fg.muted"
                _hover={{ color: 'fg' }}
                onClick={closeQuickSearch}
              >
                <X size={16} />
              </IconButton>
            </HStack>
          </Flex>

          <Box maxH="70vh" overflowY="auto" p={{ base: '4', sm: '5' }}>
            {deferredSearchValue.length === 0 ? (
              <Stack align="center" justify="center" gap="3" px="6" py="16" textAlign="center">
                <Flex boxSize="12" align="center" justify="center" rounded="lg" bg="bg.subtle" color="teal.solid">
                  <FileSearch size={20} />
                </Flex>
                <Box>
                  <Text fontWeight="medium" color="fg">
                    Start typing to search
                  </Text>
                  <Text mt="1" fontSize="sm" color="fg.muted">
                    Results will appear here without leaving the current page.
                  </Text>
                </Box>
              </Stack>
            ) : quickSearchQuery.isLoading ? (
              <Text px="2" py="10" fontSize="sm" color="fg.muted">
                Searching documents...
              </Text>
            ) : quickSearchQuery.isError ? (
              <Text px="2" py="10" fontSize="sm" color="fg.error">
                Unable to run quick search.
              </Text>
            ) : (quickSearchQuery.data?.results.length ?? 0) === 0 ? (
              <Stack align="center" justify="center" gap="3" px="6" py="16" textAlign="center">
                <Flex boxSize="12" align="center" justify="center" rounded="lg" bg="bg.subtle" color="fg.muted">
                  <SearchX size={20} />
                </Flex>
                <Box>
                  <Text fontWeight="medium" color="fg">
                    No matching documents
                  </Text>
                  <Text mt="1" fontSize="sm" color="fg.muted">
                    Try a different name, phrase, or keyword.
                  </Text>
                </Box>
              </Stack>
            ) : (
              <Stack gap="2">
                {(quickSearchQuery.data?.results ?? []).map((result) => (
                  <Box
                    key={`${result.vaultId}-${result.documentId}`}
                    as="button"
                    w="full"
                    rounded="lg"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    bg="bg.panel"
                    px="4"
                    py="4"
                    textAlign="left"
                    transition="colors"
                    _hover={{ bg: 'teal.subtle' }}
                    onClick={() => {
                      closeQuickSearch();
                      navigate(`/documents/${result.vaultId}/${result.documentId}`);
                    }}
                  >
                    <Flex direction={{ base: 'column', sm: 'row' }} gap="3" alignItems={{ base: 'stretch', sm: 'flex-start' }} justifyContent="space-between">
                      <Box minW="0">
                        <Flex align="center" gap="2">
                          <Text truncate fontSize="base" fontWeight="semibold" color="fg">
                            {result.name}
                          </Text>
                          <ArrowRight size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                        </Flex>
                        <Text mt="1" fontSize="sm" color="fg.muted">
                          {result.vaultName} &bull; {result.mimeType} &bull; Updated{' '}
                          {formatDate(result.updatedAt)}
                        </Text>
                        {result.bestChunk ? (
                          <Text mt="2" fontSize="sm" color="fg.muted">
                            {tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                              part.highlighted ? (
                                <Box
                                  as="mark"
                                  key={`${result.documentId}-${part.key}`}
                                  rounded="sm"
                                  bg="teal.subtle"
                                  color="teal.fg"
                                  px="1"
                                >
                                  {part.text}
                                </Box>
                              ) : (
                                <Text as="span" key={`${result.documentId}-${part.key}`}>
                                  {part.text}
                                </Text>
                              ),
                            )}
                          </Text>
                        ) : null}
                      </Box>
                      <Text flexShrink={0} fontSize="xs" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                        {result.bestChunk?.pageNumber !== null &&
                        result.bestChunk?.pageNumber !== undefined
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
    </Box>
  );
}

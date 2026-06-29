import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { readOptionalSearchString } from '@/app/search-params';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { buildBreadcrumbs } from '@/components/layout/app-shell-breadcrumbs';
import { WorkspaceHeader } from '@/components/layout/app-shell-header';
import {
  getSecondaryKind,
  isChatPath,
  isTextEntryTarget,
  isVaultSectionSegment,
  primaryNavId,
  readPrimarySidebarExpandedPreference,
  SecondarySidebar,
  shouldHideSecondarySidebar,
  UnifiedSidebar,
} from '@/components/layout/app-shell-navigation';
import {
  QuickSearchDialog,
  useQuickSearchController,
} from '@/components/layout/app-shell-quick-search';
import {
  AppShellTransfersDrawer,
  UploadTransferBanner,
  useTransfersDrawerController,
} from '@/components/layout/app-shell-transfers';
import { ROUTES } from '@/app/routes';
import { authClient } from '@/lib/auth-client';
import { useDocumentQuery } from '@/features/documents/documents.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { uploadManager } from '@/features/uploads/upload-manager';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

const PRIMARY_SIDEBAR_STORAGE_KEY = 'arkivra:primary-sidebar-state';

export function AppShell() {
  const location = useLocation();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const { data: sessionData } = authClient.useSession();
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);
  const [secondaryContent, setSecondaryContent] = useState<ReactNode | null>(null);
  const [isPrimarySidebarExpanded, setIsPrimarySidebarExpanded] = useState(
    readPrimarySidebarExpandedPreference,
  );
  const [isSecondarySidebarOpen, setIsSecondarySidebarOpen] = useState(true);
  const quickSearch = useQuickSearchController();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const locationKey = useMemo(
    () => `${location.pathname}:${JSON.stringify(location.search)}`,
    [location.pathname, location.search],
  );
  const transfers = useTransfersDrawerController(locationKey);
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;
  const transferVaultId = useMemo(
    () => readOptionalSearchString(location.search, 'vaultId') ?? null,
    [location.search],
  );
  const isChatRoute = isChatPath(location.pathname);
  const isVaultIndexRoute = location.pathname === ROUTES.vaults;
  const isVaultBrowserRoute = pathParts[0] === 'vaults' && pathParts.length === 2;
  const activeVaultId = pathParts[0] === 'vaults' ? pathParts[1] : transferVaultId;
  const activeDocumentRoute = useMemo(() => {
    if (pathParts[0] === 'vaults' && pathParts[2] && !isVaultSectionSegment(pathParts[2])) {
      return { vaultId: pathParts[1] ?? '', documentId: pathParts[2] ?? '' };
    }

    return null;
  }, [pathParts]);
  const isVaultWorkspaceRoute = isVaultBrowserRoute || activeDocumentRoute !== null;
  const isFlushContentRoute =
    isVaultIndexRoute ||
    isVaultWorkspaceRoute ||
    location.pathname === ROUTES.tags ||
    location.pathname === ROUTES.search ||
    pathParts[0] === 'trash';
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
  const layoutContextValue = useMemo(() => ({ setHeaderConfig, setSecondaryContent }), []);

  async function handleSignOut() {
    await uploadManager.clearForLogout();
    await authClient.signOut();
  }

  function togglePrimarySidebar() {
    setIsPrimarySidebarExpanded((expanded) => !expanded);
  }

  useEffect(() => {
    try {
      if (typeof window.localStorage?.setItem !== 'function') {
        return;
      }

      window.localStorage.setItem(
        PRIMARY_SIDEBAR_STORAGE_KEY,
        isPrimarySidebarExpanded ? 'expanded' : 'collapsed',
      );
    } catch {
      // Ignore storage failures so restricted browsers can still use the shell.
    }
  }, [isPrimarySidebarExpanded]);

  useEffect(() => {
    function handleSidebarShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'b' || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      if (isTextEntryTarget(event.target)) {
        return;
      }

      event.preventDefault();
      togglePrimarySidebar();
    }

    window.addEventListener('keydown', handleSidebarShortcut);
    return () => window.removeEventListener('keydown', handleSidebarShortcut);
  }, []);

  const secondaryKind = getSecondaryKind(location.pathname);
  const hideSecondarySidebar = shouldHideSecondarySidebar(location.pathname);
  const hasSecondarySidebar = !hideSecondarySidebar && secondaryContent !== null;
  const contentPadding = isChatRoute || isFlushContentRoute ? '0' : { base: '4', lg: '6' };
  const routeContent = (
    <>
      {transfers.uploadCount > 0 && !isVaultWorkspaceRoute ? (
        <UploadTransferBanner
          uploadCount={transfers.uploadCount}
          contentPadding={contentPadding}
          compactTopPadding={isChatRoute || isFlushContentRoute}
          onOpen={transfers.open}
        />
      ) : null}
      <Outlet />
    </>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <WorkspaceLayoutContext value={layoutContextValue}>
        <Flex h="100dvh" minH="0" bg="shell.editor" color="fg" overflow="hidden">
          <UnifiedSidebar
            expanded={isPrimarySidebarExpanded}
            activeNavId={transfers.isOpen ? 'transfers' : primaryNavId(location.pathname)}
            currentPathname={location.pathname}
            sessionAccountLabel={sessionData?.user.name?.trim() || sessionData?.user.email}
            isAdmin={meQuery.data?.isAdmin}
            aiFeaturesEnabled={aiFeaturesEnabled}
            onOpenTransfers={transfers.open}
            onToggleExpanded={togglePrimarySidebar}
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

          <Flex minW="0" flex="1" h="100dvh" minH="0" direction="column" overflow="hidden">
            <WorkspaceHeader
              breadcrumbs={breadcrumbs}
              headerConfig={isChatRoute ? { hidden: true } : headerConfig}
              hasSecondarySidebar={hasSecondarySidebar}
              isSecondarySidebarOpen={isSecondarySidebarOpen}
              quickSearchShortcut={quickSearch.shortcut}
              hideQuickSearch={
                location.pathname === ROUTES.search || location.pathname === ROUTES.trash
              }
              onToggleSecondarySidebar={() => setIsSecondarySidebarOpen((open) => !open)}
              onOpenQuickSearch={quickSearch.open}
            />

            <Box
              as="main"
              className="@container/main"
              flex="1"
              minH="0"
              overflow={isChatRoute || isFlushContentRoute ? 'hidden' : 'auto'}
              bg="shell.editor"
              px={contentPadding}
              py="0"
            >
              {routeContent}
            </Box>
          </Flex>
        </Flex>

        <QuickSearchDialog controller={quickSearch} />

        <AppShellTransfersDrawer open={transfers.isOpen} onOpenChange={transfers.setIsOpen} />
      </WorkspaceLayoutContext>
    </TooltipProvider>
  );
}

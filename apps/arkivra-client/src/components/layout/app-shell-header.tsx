import { Box, Flex, HStack, IconButton } from '@chakra-ui/react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { DefaultBreadcrumbs } from '@/components/layout/app-shell-breadcrumbs';
import type { BreadcrumbEntry } from '@/components/layout/app-shell-breadcrumbs';
import { QuickSearchTrigger } from '@/components/layout/app-shell-quick-search';
import type { QuickSearchShortcut } from '@/components/layout/app-shell-quick-search';

export function WorkspaceHeader({
  breadcrumbs,
  headerConfig,
  hasSecondarySidebar,
  isSecondarySidebarOpen,
  quickSearchShortcut,
  hideQuickSearch = false,
  onToggleSecondarySidebar,
  onOpenQuickSearch,
}: {
  breadcrumbs: BreadcrumbEntry[];
  headerConfig: WorkspaceHeaderConfig | null;
  hasSecondarySidebar: boolean;
  isSecondarySidebarOpen: boolean;
  quickSearchShortcut: QuickSearchShortcut;
  hideQuickSearch?: boolean;
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
        bg="bg.header"
        position="relative"
      >
        {hasSecondarySidebar ? (
          <Flex align="center" gap="1" px={{ base: '4', md: '5', lg: '4' }}>
            <IconButton
              display={{ base: 'none', md: 'inline-flex' }}
              type="button"
              aria-label={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
              title={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
              variant="ghost"
              size="sm"
              color="fg.muted"
              flexShrink={0}
              onClick={onToggleSecondarySidebar}
            >
              {isSecondarySidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </IconButton>
          </Flex>
        ) : null}
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
      bg="bg.header"
      px={{ base: '4', md: '5', lg: '4' }}
      position="relative"
    >
      <Flex minW="0" flex="1" align="center" gap="3">
        {hasSecondarySidebar ? (
          <IconButton
            display={{ base: 'none', md: 'inline-flex' }}
            type="button"
            aria-label={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
            title={isSecondarySidebarOpen ? 'Hide secondary sidebar' : 'Show secondary sidebar'}
            variant="ghost"
            size="sm"
            color="fg.muted"
            flexShrink={0}
            onClick={onToggleSecondarySidebar}
          >
            {isSecondarySidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
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

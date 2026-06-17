/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileSearch, Search, SearchX, X } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Box, Button as ChakraButton, Flex, HStack, IconButton, Input, Kbd, Stack, Text } from '@chakra-ui/react';
import { AppEmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ROUTES } from '@/app/routes';
import { formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';

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

const QUICK_SEARCH_QUERY_DEBOUNCE_MS = 280;

export function QuickSearchTrigger({
  shortcut,
  onOpen,
  size = 'sm',
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
      size={size}
      justifyContent="center"
      gap="1.5"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.workspace"
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
export type QuickSearchShortcut = ReturnType<typeof getQuickSearchShortcut>;

export interface QuickSearchController {
  shortcut: QuickSearchShortcut;
  open: () => void;
  close: () => void;
  isOpen: boolean;
  searchValue: string;
  setSearchValue: (value: string) => void;
  debouncedSearchValue: string;
}

export function useQuickSearchController(): QuickSearchController {
  const [searchValue, setSearchValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const shortcut = useMemo(() => getQuickSearchShortcut(), []);
  const debouncedSearchValue = useDebouncedValue(searchValue.trim(), QUICK_SEARCH_QUERY_DEBOUNCE_MS);

  function close() {
    setSearchValue('');
    setIsOpen(false);
  }

  function open() {
    setIsOpen(true);
  }

  useEffect(() => {
    function handleQuickSearchShortcut(event: KeyboardEvent) {
      if (!event.metaKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setIsOpen(true);
    }

    window.addEventListener('keydown', handleQuickSearchShortcut);
    return () => window.removeEventListener('keydown', handleQuickSearchShortcut);
  }, []);

  return {
    shortcut,
    open,
    close,
    isOpen,
    searchValue,
    setSearchValue,
    debouncedSearchValue,
  };
}

export function QuickSearchDialog({ controller }: { controller: QuickSearchController }) {
  const navigate = useNavigate();
  const quickSearchQuery = useGlobalSearchDocumentsQuery({
    query: controller.debouncedSearchValue,
    pageIndex: 0,
    pageSize: 8,
    enabled: controller.isOpen && controller.debouncedSearchValue.length > 0,
  });

  return (
    <Dialog
      open={controller.isOpen}
      onOpenChange={(open) => {
        if (open) {
          controller.open();
          return;
        }

        controller.close();
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
                value={controller.searchValue}
                onChange={(event) => controller.setSearchValue(event.target.value)}
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
              {controller.searchValue.length > 0 ? (
                <IconButton
                  type="button"
                  aria-label="Clear search"
                  position="absolute"
                  right="3"
                  top="50%"
                  transform="translateY(-50%)"
                  variant="ghost"
                  size="sm"
                  rounded="md"
                  color="fg.muted"
                  _hover={{ bg: 'teal.subtle', color: 'fg' }}
                  onClick={() => controller.setSearchValue('')}
                >
                  <X size={16} />
                </IconButton>
              ) : null}
            </Box>
            <IconButton
              type="button"
              aria-label="Close search"
              variant="outline"
              size="sm"
              rounded="md"
              borderColor="border.surface"
              bg="bg.surface"
              color="fg.muted"
              _hover={{ color: 'fg' }}
              onClick={controller.close}
            >
              <X size={16} />
            </IconButton>
          </HStack>
        </Flex>

        <Box maxH="70vh" overflowY="auto" p={{ base: '4', sm: '5' }}>
          {controller.debouncedSearchValue.length === 0 ? (
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
                    controller.close();
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
  );
}

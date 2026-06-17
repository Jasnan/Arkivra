import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentPropsWithoutRef, FormEvent, MouseEvent } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import type { VirtuosoGridProps } from 'react-virtuoso';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, HStack, Menu, Portal, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { Check, ChevronDown, Download, Eye, FileSearch, Info, MoveRight, Pencil, SearchX, Sparkles, Tags, Trash2, Vault } from 'lucide-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SearchRouteSearch } from '@/app/search-params';
import { validateSearchRouteSearch } from '@/app/search-params';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Button } from '@/components/ui/button';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster-store';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentSearchControls,
  SearchFilterMultiSelect,
} from '@/features/documents/components/document-search-controls';
import type { DocumentSearchControlFilter } from '@/features/documents/components/document-search-controls';
import { getDocumentDownloadUrl, moveDocument, renameDocument, softDeleteDocument } from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { FileBrowserViewToggle } from '@/features/file-browser/components/file-browser-view-toggle';
import { usePreferredFileBrowserView } from '@/features/file-browser/components/use-preferred-file-browser-view';
import {
  BrowserContextMenu,
  FileBrowserIcon,
  GridItemName,
  ItemInfoDialog,
  MoveItemDialog,
  RenameItemDialog,
} from '@/features/file-browser/components/vault-browser-components';
import { fileBrowserQueryKeys, useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { getFileDisplayName, getMoveDestinations } from '@/features/file-browser/components/vault-browser.types';
import type { BrowserContextMenuEntry, BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { searchQueryKeys, useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import type { SearchMode, SearchResultItem, SearchSortBy } from '@/features/search/search.types';
import { TagBadge } from '@/features/tags/components/tag-badge';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { formatDateRange } from '@/lib/localization';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const SEARCH_RESULT_LIMIT = 25;
const SEARCH_QUERY_DEBOUNCE_MS = 280;
const SEARCH_TERM_SEPARATOR = /\s+/;
const SNIPPET_WHITESPACE = /\s+/g;
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Recent' },
  { value: 'created_asc', label: 'Oldest' },
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
];
const SEARCH_RESULT_COLUMNS =
  'minmax(0, 1fr) minmax(7rem, 9rem) minmax(5.5rem, 7rem) minmax(8rem, 10rem)';
const SEARCH_RETURN_SOURCE = 'search';
const SEARCH_LIST_SEPARATOR = ',';
const searchListRowHeights = {
  compact: 72,
  comfortable: 80,
  relaxed: 92,
} as const;
const SEARCH_GRID_ITEM_WIDTH = '10.75rem';
const SEARCH_GRID_ITEM_HEIGHT = '8rem';
const SEARCH_GRID_ITEM_GAP = '0.8rem';
const SEARCH_GRID_ITEM_PADDING = '0.75rem';

const searchGridComponents: VirtuosoGridProps<SearchResultItem, unknown>['components'] = {
  // eslint-disable-next-line react/no-forward-ref -- react-virtuoso's documented grid adapter passes its measured list ref this way.
  List: forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
    ({ style, children, ...props }, ref) => (
      <div
        ref={ref}
        {...props}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          ...style,
        }}
      >
        {children}
      </div>
    ),
  ),
  Item: ({ children, ...props }) => (
    <div
      {...props}
      style={{
        padding: `calc(var(--arkivra-gridItemGap, ${SEARCH_GRID_ITEM_GAP}) / 2)`,
        width: `calc(${SEARCH_GRID_ITEM_WIDTH} + var(--arkivra-gridItemGap, ${SEARCH_GRID_ITEM_GAP}))`,
        display: 'flex',
        flex: 'none',
        alignContent: 'stretch',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  ),
};

function getSearchReturnParams({
  query,
  vaultIds,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
  searchMode,
}: {
  query: string;
  vaultIds: string[];
  tagIds: string[];
  dateFrom: string;
  dateTo: string;
  sortBy: SearchSortBy;
  searchMode: SearchMode;
}) {
  const params: Record<string, string> = {
    source: SEARCH_RETURN_SOURCE,
    sortBy,
  };
  const trimmedQuery = query.trim();

  if (trimmedQuery.length > 0) params.q = trimmedQuery;
  if (vaultIds.length > 0) params.vaultIds = joinSearchList(vaultIds);
  if (tagIds.length > 0) params.tagIds = joinSearchList(tagIds);
  if (dateFrom.length > 0) params.dateFrom = dateFrom;
  if (dateTo.length > 0) params.dateTo = dateTo;
  if (searchMode === 'hybrid' || searchMode === 'keyword') params.searchMode = searchMode;

  return params;
}

function parseSearchList(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? '')
        .split(SEARCH_LIST_SEPARATOR)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function joinSearchList(values: string[]) {
  return values.join(SEARCH_LIST_SEPARATOR);
}

type SearchResultBrowserDocument = Extract<BrowserItem, { type: 'document' }>['document'] & {
  vaultId: string;
  vaultName: string;
};

type SearchResultBrowserItem = Extract<BrowserItem, { type: 'document' }> & {
  type: 'document';
  document: SearchResultBrowserDocument;
};

type SearchResultContextMenuState = {
  item: SearchResultBrowserItem;
  x: number;
  y: number;
} | null;

function searchResultToBrowserItem(result: SearchResultItem): SearchResultBrowserItem {
  return {
    type: 'document',
    document: {
      id: result.documentId,
      vaultId: result.vaultId,
      vaultName: result.vaultName,
      name: result.name,
      originalName: result.originalName,
      folderId: null,
      originalSize: result.originalSize,
      mimeType: result.mimeType,
      processingStatus: 'completed',
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      isDeleted: false,
      deletedAt: null,
    },
  };
}

function getSearchItemVaultId(item: SearchResultBrowserItem) {
  return item.document.vaultId;
}

function downloadSearchResultDocument(item: SearchResultBrowserItem) {
  const link = window.document.createElement('a');
  link.href = getDocumentDownloadUrl({ vaultId: getSearchItemVaultId(item), documentId: item.document.id });
  link.download = '';
  link.rel = 'noopener';
  window.document.body.appendChild(link);
  link.click();
  link.remove();
}

function tokenizeTextMatches(text: string, query: string) {
  const terms = Array.from(
    new Set(query.trim().toLowerCase().split(SEARCH_TERM_SEPARATOR).filter(Boolean)),
  ).sort((left, right) => right.length - left.length);

  if (terms.length === 0) {
    return [{ key: '0', text, highlighted: false }];
  }

  const lowerText = text.toLowerCase();
  const parts: Array<{ key: string; text: string; highlighted: boolean }> = [];
  let index = 0;

  while (index < text.length) {
    let nextStart = -1;
    let nextTerm = '';

    for (const term of terms) {
      const termIndex = lowerText.indexOf(term, index);

      if (
        termIndex !== -1 &&
        (nextStart === -1 ||
          termIndex < nextStart ||
          (termIndex === nextStart && term.length > nextTerm.length))
      ) {
        nextStart = termIndex;
        nextTerm = term;
      }
    }

    if (nextStart === -1) {
      parts.push({ key: `${parts.length}-${index}`, text: text.slice(index), highlighted: false });
      break;
    }

    if (nextStart > index) {
      parts.push({
        key: `${parts.length}-${index}`,
        text: text.slice(index, nextStart),
        highlighted: false,
      });
    }

    parts.push({
      key: `${parts.length}-${nextStart}`,
      text: text.slice(nextStart, nextStart + nextTerm.length),
      highlighted: true,
    });
    index = nextStart + nextTerm.length;
  }

  return parts;
}

function HighlightedTitle({ text, query }: { text: string; query: string }) {
  return (
    <>
      {tokenizeTextMatches(text, query).map((part) =>
        part.highlighted ? (
          <Box
            as="mark"
            display="inline"
            key={part.key}
            rounded="md"
            bg="teal.subtle"
            px="1"
            py="0.5"
            color="fg"
          >
            {part.text}
          </Box>
        ) : (
          <Text as="span" key={part.key}>
            {part.text}
          </Text>
        ),
      )}
    </>
  );
}

function normalizeSnippetMarkup(value: string) {
  return value.replace(SNIPPET_WHITESPACE, ' ').trim();
}

function SearchResultSnippet({ result }: { result: SearchResultItem }) {
  if (!result.bestChunk) {
    return null;
  }

  const isSemanticMatch = result.bestChunk.matchType === 'semantic';
  const snippet = normalizeSnippetMarkup(result.bestChunk.snippet);
  const chunkCountLabel = isSemanticMatch ? 'related chunk' : 'matching chunk';

  return (
    <Box minW="0">
      <Text
        maxW="full"
        overflow="hidden"
        fontSize="sm"
        lineHeight="1.35"
        color="fg.muted"
        whiteSpace="normal"
        wordBreak="break-word"
      >
        {isSemanticMatch ? (
          <Text as="span">{snippet}</Text>
        ) : (
          tokenizeSnippet(snippet).map((part) =>
            part.highlighted ? (
              <Box
                as="mark"
                display="inline"
                key={`${result.documentId}-${part.key}`}
                rounded="md"
                bg="teal.subtle"
                px="1"
                py="0"
                color="fg"
                lineHeight="inherit"
              >
                {part.text}
              </Box>
            ) : (
              <Text as="span" key={`${result.documentId}-${part.key}`}>
                {part.text}
              </Text>
            ),
          )
        )}
      </Text>

      <Flex mt="1" flexWrap="wrap" gap="1">
        {isSemanticMatch ? (
          <Box
            as="span"
            rounded="md"
            bg="bg.subtle"
            px="2"
            py="0.5"
            fontSize="xs"
            lineHeight="1.2"
            color="fg.muted"
          >
            Meaning match
          </Box>
        ) : null}
        {result.bestChunk.pageNumber !== null ? (
          <Box
            as="span"
            rounded="md"
            bg="bg.subtle"
            px="2"
            py="0.5"
            fontSize="xs"
            lineHeight="1.2"
            color="fg.muted"
          >
            Page {result.bestChunk.pageNumber}
          </Box>
        ) : null}
        <Box
          as="span"
          rounded="md"
          bg="bg.subtle"
          px="2"
          py="0.5"
          fontSize="xs"
          lineHeight="1.2"
          color="fg.muted"
        >
          {result.matchedChunksCount} {chunkCountLabel}
          {result.matchedChunksCount === 1 ? '' : 's'}
        </Box>
        {result.bestChunk.chunkType ? (
          <Box
            as="span"
            rounded="md"
            bg="bg.subtle"
            px="2"
            py="0.5"
            fontSize="xs"
            lineHeight="1.2"
            color="fg.muted"
          >
            {result.bestChunk.chunkType}
          </Box>
        ) : null}
      </Flex>
    </Box>
  );
}

function SearchResultRow({
  result,
  detailSearch,
  isLast,
  onOpenContextMenu,
  query,
}: {
  result: SearchResultItem;
  detailSearch: Record<string, string>;
  isLast?: boolean;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: SearchResultBrowserItem) => void;
  query: string;
}) {
  const documentTo = ROUTES.vaultDocument(result.vaultId, result.documentId);
  const visibleTags = (result.tags ?? []).slice(0, 2);
  const remainingTagsCount = Math.max(0, (result.tags ?? []).length - visibleTags.length);
  const browserItem = searchResultToBrowserItem(result);

  return (
    <Link
      to={documentTo}
      search={detailSearch as any}
      style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
      aria-label={`Open ${result.name}`}
      onContextMenu={(event) => onOpenContextMenu(event, browserItem)}
    >
      <Grid
        as="article"
        alignItems="start"
        templateColumns={{ base: '1fr', md: SEARCH_RESULT_COLUMNS }}
        gap={{ base: '3', xl: '4' }}
        borderBottomWidth={isLast ? '0' : '1px'}
        borderColor="border.surface"
        bg="bg.workspace"
        px={{ base: '4', lg: '6' }}
        py="var(--arkivra-rowPaddingY, 0.875rem)"
        minH="var(--arkivra-listRowHeight, 4.5rem)"
        cursor="pointer"
        transition="background-color 0.15s ease"
        _hover={{ bg: 'bg.workspaceMuted' }}
      >
        <Flex minW="0" maxW="full" overflow="hidden" align="flex-start" gap="3">
          <FileBrowserIcon item={browserItem} size="search" />
          <Box minW="0" maxW="full" overflow="hidden">
            <Text
              truncate
              fontSize="sm"
              fontWeight="semibold"
              color="fg"
              transition="colors"
              _hover={{ color: 'teal.solid' }}
            >
              <HighlightedTitle text={result.name} query={query} />
            </Text>
            {result.originalName !== result.name ? (
              <Text mt="1" truncate fontSize="xs" color="fg.muted">
                {result.originalName}
              </Text>
            ) : null}
            <Box mt="1.5">
              <SearchResultSnippet result={result} />
            </Box>
          </Box>
        </Flex>

        <Stack gap="2" minW="0">
          <Flex align="center" gap="2" minW="0" color="fg">
            <Vault size={14} />
            <Text truncate fontSize="sm" fontWeight="medium">
              {result.vaultName}
            </Text>
          </Flex>
          {(result.tags ?? []).length > 0 ? (
            <Flex flexWrap="wrap" gap="1.5">
              {visibleTags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} />
              ))}
              {remainingTagsCount > 0 ? (
                <Box
                  as="span"
                  display="inline-flex"
                  h="8"
                  alignItems="center"
                  rounded="md"
                  bg="bg.subtle"
                  px="2.5"
                  fontSize="sm"
                  fontWeight="semibold"
                  color="fg.muted"
                >
                  +{remainingTagsCount}
                </Box>
              ) : null}
            </Flex>
          ) : null}
        </Stack>

        <Stack gap="1" minW="0">
          <Text fontSize="sm" color="fg">
            {formatBytes(result.originalSize)}
          </Text>
        </Stack>

        <Stack gap="1" minW="0">
          <Text fontSize="sm" color="fg">
            {formatDate(result.updatedAt)}
          </Text>
        </Stack>
      </Grid>
    </Link>
  );
}

function SearchResultList({
  detailSearch,
  onOpenContextMenu,
  query,
  results,
}: {
  detailSearch: Record<string, string>;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: SearchResultBrowserItem) => void;
  query: string;
  results: SearchResultItem[];
}) {
  const { density } = useAccentColor();

  return (
    <Flex flex="1" minH="0" direction="column" overflow="hidden">
      <Grid
        display={{ base: 'none', md: 'grid' }}
        templateColumns={SEARCH_RESULT_COLUMNS}
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.surface"
        flexShrink="0"
        bg="bg.workspace"
        px="6"
        py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
        fontSize="sm"
        color="fg.muted"
      >
        <Text as="span">Name</Text>
        <Text as="span">Vault</Text>
        <Text as="span">Size</Text>
        <Text as="span">Modified</Text>
      </Grid>

      <Box flex="1" minH="0" overflow="hidden">
        <Virtuoso
          data={results}
          defaultItemHeight={searchListRowHeights[density]}
          computeItemKey={(index, result) =>
            result ? `${result.vaultId}-${result.documentId}` : `result-${index}`
          }
          initialItemCount={Math.min(results.length, 24)}
          style={{ height: '100%' }}
          itemContent={(index, result) =>
            result ? (
              <SearchResultRow
                result={result}
                detailSearch={detailSearch}
                isLast={index === results.length - 1}
                onOpenContextMenu={onOpenContextMenu}
                query={query}
              />
            ) : null
          }
        />
      </Box>
    </Flex>
  );
}

function SearchResultGridCard({
  detailSearch,
  onOpenContextMenu,
  result,
}: {
  detailSearch: Record<string, string>;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: SearchResultBrowserItem) => void;
  result: SearchResultItem;
}) {
  const { density } = useAccentColor();
  const displayName = getFileDisplayName(result.name);
  const browserItem = searchResultToBrowserItem(result);

  return (
    <Link
      to={ROUTES.vaultDocument(result.vaultId, result.documentId)}
      search={detailSearch as any}
      style={{ display: 'block', width: '100%', color: 'inherit', textDecoration: 'none' }}
      aria-label={`Open ${result.name}`}
      onContextMenu={(event) => onOpenContextMenu(event, browserItem)}
    >
      <Flex
        h={`var(--arkivra-gridItemHeight, ${SEARCH_GRID_ITEM_HEIGHT})`}
        align="center"
        justify="center"
        p={`var(--arkivra-gridItemPadding, ${SEARCH_GRID_ITEM_PADDING})`}
        rounded="md"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.workspace"
        px="3"
        textAlign="center"
        transition="background-color 0.15s ease, border-color 0.15s ease"
        _hover={{ bg: 'bg.workspaceMuted', borderColor: 'border.strong' }}
        _focusVisible={{
          outline: '2px solid',
          outlineColor: 'teal.focusRing',
          outlineOffset: '2px',
        }}
      >
        <Stack align="center" justify="center" gap="2.5" w="full" minW="0" textAlign="center">
          <FileBrowserIcon item={browserItem} />
          <Box w="full" minW="0" maxW="full" px="1">
            <GridItemName name={displayName} density={density} />
          </Box>
        </Stack>
      </Flex>
    </Link>
  );
}

function SearchResultGrid({
  detailSearch,
  onOpenContextMenu,
  results,
}: {
  detailSearch: Record<string, string>;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: SearchResultBrowserItem) => void;
  results: SearchResultItem[];
}) {
  return (
    <Box flex="1" minH="0" overflow="hidden" bg="bg.workspace" px={{ base: '3', lg: '4' }} py="3">
      <VirtuosoGrid
        data={results}
        components={searchGridComponents}
        computeItemKey={(index, result) =>
          result ? `${result.vaultId}-${result.documentId}` : `result-${index}`
        }
        initialItemCount={Math.min(results.length, 24)}
        style={{ height: '100%', width: '100%' }}
        itemContent={(_, result) =>
          result
            ? (
                <SearchResultGridCard
                  result={result}
                  detailSearch={detailSearch}
                  onOpenContextMenu={onOpenContextMenu}
                />
              )
            : null
        }
      />
    </Box>
  );
}

function SearchModeControl({
  value,
  onValueChange,
}: {
  value: SearchMode;
  onValueChange: (value: SearchMode) => void;
}) {
  const selectedLabel = value === 'hybrid' ? 'AI Enhanced' : 'Keyword Only';

  return (
    <Menu.Root positioning={{ placement: 'bottom-end', gutter: 6 }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          aria-label={`Search mode: ${selectedLabel}`}
          variant="ghost"
          size="sm"
          display="inline-flex"
          h="8"
          minH="8"
          minW="0"
          rounded="md"
          px="2"
          gap="2"
          color="fg"
          _hover={{ bg: 'bg.subtle', color: 'fg' }}
          _focusVisible={{
            outline: '2px solid',
            outlineColor: 'teal.focusRing',
            outlineOffset: '1px',
          }}
        >
          <Box color="teal.solid" aria-hidden="true">
            <Sparkles size={17} />
          </Box>
          <Text
            as="span"
            display={{ base: 'none', md: 'inline' }}
            fontSize="sm"
            fontWeight="medium"
            whiteSpace="nowrap"
          >
            {selectedLabel}
          </Text>
          <Box display={{ base: 'none', md: 'block' }} color="fg.muted" aria-hidden="true">
            <ChevronDown size={15} />
          </Box>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner zIndex="dropdown">
          <Menu.Content
            minW="15rem"
            rounded="lg"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            p="1.5"
            shadow="lg"
          >
            <Menu.RadioItemGroup
              value={value}
              onValueChange={(event) => {
                if (event.value === 'hybrid' || event.value === 'keyword') {
                  onValueChange(event.value);
                }
              }}
            >
              <Menu.RadioItem
                value="hybrid"
                position="relative"
                minH="3.5rem"
                rounded="md"
                ps="3"
                pe="10"
                py="2"
                color="fg"
                _checked={{ bg: 'teal.subtle' }}
                _highlighted={{ bg: value === 'hybrid' ? 'teal.subtle' : 'bg.subtle' }}
              >
                <Box
                  position="absolute"
                  right="2.5"
                  top="50%"
                  display="flex"
                  boxSize="5"
                  alignItems="center"
                  justifyContent="center"
                  color="teal.solid"
                  transform="translateY(-50%)"
                >
                  <Menu.ItemIndicator>
                    <Check size={16} strokeWidth={2.5} />
                  </Menu.ItemIndicator>
                </Box>
                <Menu.ItemText>
                  <Stack gap="0.5">
                    <Text as="span" fontSize="sm" fontWeight="semibold">
                      AI Enhanced
                    </Text>
                    <Text as="span" fontSize="xs" color="fg.muted">
                      Meaning + keyword matching
                    </Text>
                  </Stack>
                </Menu.ItemText>
              </Menu.RadioItem>

              <Menu.RadioItem
                value="keyword"
                position="relative"
                minH="3.5rem"
                rounded="md"
                ps="3"
                pe="10"
                py="2"
                color="fg"
                _checked={{ bg: 'teal.subtle' }}
                _highlighted={{ bg: value === 'keyword' ? 'teal.subtle' : 'bg.subtle' }}
              >
                <Box
                  position="absolute"
                  right="2.5"
                  top="50%"
                  display="flex"
                  boxSize="5"
                  alignItems="center"
                  justifyContent="center"
                  color="teal.solid"
                  transform="translateY(-50%)"
                >
                  <Menu.ItemIndicator>
                    <Check size={16} strokeWidth={2.5} />
                  </Menu.ItemIndicator>
                </Box>
                <Menu.ItemText>
                  <Stack gap="0.5">
                    <Text as="span" fontSize="sm" fontWeight="semibold">
                      Keyword Only
                    </Text>
                    <Text as="span" fontSize="xs" color="fg.muted">
                      Exact word matching
                    </Text>
                  </Stack>
                </Menu.ItemText>
              </Menu.RadioItem>
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function toInputDateValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildPresetRange(preset: Exclude<DatePreset, 'custom'>) {
  const today = new Date();
  const dateTo = toInputDateValue(today);

  if (preset === 'any') {
    return { dateFrom: '', dateTo: '' };
  }

  const start = new Date(today);
  start.setDate(start.getDate() - (preset === 'last_7_days' ? 6 : 29));

  return {
    dateFrom: toInputDateValue(start),
    dateTo,
  };
}

function formatDateRangeLabel(dateFrom?: string, dateTo?: string) {
  return formatDateRange(dateFrom, dateTo);
}

function getDateFilterLabel({
  preset,
  dateFrom,
  dateTo,
}: {
  preset: DatePreset;
  dateFrom?: string;
  dateTo?: string;
}) {
  if (preset === 'last_7_days') {
    return 'Last 7 days';
  }

  if (preset === 'last_30_days') {
    return 'Last 30 days';
  }

  if (preset === 'custom') {
    return formatDateRangeLabel(dateFrom, dateTo);
  }

  return 'Any time';
}

function SearchTrashConfirmDialog({
  item,
  isPending,
  onClose,
  onConfirm,
}: {
  item: SearchResultBrowserItem | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ChakraDialog.Root
      open={item !== null}
      onOpenChange={(event) => {
        if (!event.open && !isPending) {
          onClose();
        }
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>
                {item ? `Move "${item.document.name}" to trash?` : 'Move document to trash?'}
              </ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Text color="fg.muted">This document will be moved to Trash.</Text>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" colorPalette="red" onClick={onConfirm} loading={isPending}>
                {isPending ? 'Moving...' : 'Move to trash'}
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function SearchPage() {
  const navigate = useNavigate({ from: ROUTES.search });
  const queryClient = useQueryClient();
  const search = validateSearchRouteSearch(useSearch({ strict: false }));
  const [query, setQuery] = useState(search.q ?? '');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<SearchResultContextMenuState>(null);
  const [renameTarget, setRenameTarget] = useState<SearchResultBrowserItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<SearchResultBrowserItem | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<SearchResultBrowserItem | null>(null);
  const [pendingTrashItem, setPendingTrashItem] = useState<SearchResultBrowserItem | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(
    search.dateFrom || search.dateTo ? 'custom' : 'any',
  );
  const [browserView, setBrowserView] = usePreferredFileBrowserView();
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_QUERY_DEBOUNCE_MS);
  const meQuery = useMeQuery();
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled === true;

  const selectedVaultIds = useMemo(() => {
    const vaultIds = parseSearchList(search.vaultIds);
    const legacyVaultId = search.vaultId ?? '';

    return vaultIds.length > 0 ? vaultIds : legacyVaultId ? [legacyVaultId] : [];
  }, [search.vaultId, search.vaultIds]);
  const selectedTagIds = useMemo(() => {
    const tagIds = parseSearchList(search.tagIds);
    const legacyTagId = search.tagId ?? '';

    return tagIds.length > 0 ? tagIds : legacyTagId ? [legacyTagId] : [];
  }, [search.tagId, search.tagIds]);
  const dateFrom = search.dateFrom ?? '';
  const dateTo = search.dateTo ?? '';
  const sortBy = search.sortBy ?? 'created_desc';
  const requestedSearchMode = search.searchMode;
  const hasSearchCriteria =
    debouncedQuery.length > 0 ||
    selectedVaultIds.length > 0 ||
    selectedTagIds.length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0;

  useEffect(() => {
    if ((search.q ?? '') === debouncedQuery) {
      return;
    }

    navigate({
      search: (prev: SearchRouteSearch) => {
        const next: SearchRouteSearch = { ...prev };
        if (debouncedQuery.length > 0) {
          next.q = debouncedQuery;
        } else {
          delete next.q;
        }
        return next;
      },
      replace: true,
    });
  }, [debouncedQuery, navigate, search.q]);

  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useAccessibleTagsQuery();
  const vaults = useMemo(() => vaultsQuery.data?.vaults ?? [], [vaultsQuery.data?.vaults]);
  const tags = useMemo(() => tagsQuery.data?.tags ?? [], [tagsQuery.data?.tags]);
  const fullAiVaultIds = useMemo(
    () =>
      new Set(
        vaults
          .filter((vault) => vault.aiAccessLevel === 'full' || !('aiAccessLevel' in vault))
          .map((vault) => vault.id),
      ),
    [vaults],
  );
  const semanticSearchAvailable =
    aiFeaturesEnabled &&
    (selectedVaultIds.length > 0
      ? selectedVaultIds.every((vaultId) => fullAiVaultIds.has(vaultId))
      : fullAiVaultIds.size > 0 || vaults.length === 0);
  const selectedSearchMode: SearchMode = semanticSearchAvailable
    ? (requestedSearchMode ?? 'hybrid')
    : 'keyword';
  const searchMode: SearchMode =
    selectedSearchMode === 'hybrid' && debouncedQuery.length > 0 ? 'hybrid' : 'keyword';
  const searchQuery = useGlobalSearchDocumentsQuery({
    query: debouncedQuery,
    pageIndex: 0,
    pageSize: SEARCH_RESULT_LIMIT,
    vaultIds: selectedVaultIds.length > 0 ? selectedVaultIds : undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    searchMode,
    enabled: !vaultsQuery.isLoading && hasSearchCriteria,
  });
  const moveVaultId = moveTarget ? getSearchItemVaultId(moveTarget) : '';
  const folderTreeQuery = useFolderTreeQuery({
    vaultId: moveVaultId,
    enabled: moveTarget !== null,
  });
  const moveDestinations = useMemo(
    () => getMoveDestinations({ folders: folderTreeQuery.data?.folders ?? [], target: moveTarget }),
    [folderTreeQuery.data?.folders, moveTarget],
  );

  async function invalidateSearchResultActions() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
    ]);
  }

  const renameMutation = useMutation({
    mutationFn: ({ target, name }: { target: SearchResultBrowserItem; name: string }) =>
      renameDocument({ vaultId: getSearchItemVaultId(target), documentId: target.document.id, name }),
    onSuccess: async () => {
      toast.success('Document renamed.');
      setRenameTarget(null);
      setRenameValue('');
      await invalidateSearchResultActions();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename document.');
    },
  });
  const moveMutation = useMutation({
    mutationFn: ({ target, destinationId }: { target: SearchResultBrowserItem; destinationId: string | null }) =>
      moveDocument({ vaultId: getSearchItemVaultId(target), documentId: target.document.id, folderId: destinationId }),
    onSuccess: async () => {
      toast.success('Document moved.');
      setMoveTarget(null);
      setMoveDestinationId(null);
      await invalidateSearchResultActions();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not move document.');
    },
  });
  const trashMutation = useMutation({
    mutationFn: (target: SearchResultBrowserItem) =>
      softDeleteDocument({ vaultId: getSearchItemVaultId(target), documentId: target.document.id }),
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      setPendingTrashItem(null);
      await invalidateSearchResultActions();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not move document to trash.');
    },
  });

  const selectedVaults = useMemo(
    () => vaults.filter((vault) => selectedVaultIds.includes(vault.id)),
    [selectedVaultIds, vaults],
  );
  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedTagIds.includes(tag.id)),
    [selectedTagIds, tags],
  );

  const updateFilters = useCallback(
    (nextValues: Record<string, string>) => {
      navigate({
        search: (prev: SearchRouteSearch) => {
          const next: SearchRouteSearch = { ...prev };
          for (const [key, value] of Object.entries(nextValues)) {
            const searchKey = key as keyof SearchRouteSearch;
            if (value) {
              Object.assign(next, { [searchKey]: value });
            } else {
              delete next[searchKey];
            }
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const resetFilters = useCallback(() => {
    setDatePreset('any');
    updateFilters({
      vaultId: '',
      vaultIds: '',
      tagId: '',
      tagIds: '',
      dateFrom: '',
      dateTo: '',
      sortBy: 'created_desc',
      searchMode: '',
    });
  }, [updateFilters]);

  const setPresetDateFilter = useCallback(
    (value: DatePreset) => {
      setDatePreset(value);

      if (value === 'custom') {
        return;
      }

      const range = buildPresetRange(value);
      updateFilters(range);
    },
    [updateFilters],
  );

  const activeFilters: DocumentSearchControlFilter[] = useMemo(
    () => [
      ...selectedVaults.map((vault) => ({
        key: `vault-${vault.id}`,
        label: vault.name,
        onRemove: () => {
          updateFilters({
            vaultId: '',
            vaultIds: joinSearchList(selectedVaultIds.filter((item) => item !== vault.id)),
          });
        },
      })),
      ...selectedTags.map((tag) => ({
        key: `tag-${tag.id}`,
        label: tag.name,
        onRemove: () => {
          updateFilters({
            tagId: '',
            tagIds: joinSearchList(selectedTagIds.filter((item) => item !== tag.id)),
          });
        },
      })),
      ...(dateFrom || dateTo
        ? [
            {
              key: 'date-range',
              label: getDateFilterLabel({ preset: datePreset, dateFrom, dateTo }),
              onRemove: () => {
                setDatePreset('any');
                updateFilters({ dateFrom: '', dateTo: '' });
              },
            },
          ]
        : []),
    ],
    [
      dateFrom,
      datePreset,
      dateTo,
      selectedTagIds,
      selectedTags,
      selectedVaultIds,
      selectedVaults,
      updateFilters,
    ],
  );
  const hasActiveSearch = !vaultsQuery.isLoading && hasSearchCriteria;
  const results = hasActiveSearch ? (searchQuery.data?.results ?? []) : [];
  const detailSearch = getSearchReturnParams({
    query: debouncedQuery,
    vaultIds: selectedVaultIds,
    tagIds: selectedTagIds,
    dateFrom,
    dateTo,
    sortBy,
    searchMode: selectedSearchMode,
  });
  const canMutateSearchItem = useCallback(
    (item: SearchResultBrowserItem) => {
      const vault = vaults.find(candidate => candidate.id === getSearchItemVaultId(item));
      return vault?.isAdmin === true || vault?.role === 'owner' || vault?.role === 'editor';
    },
    [vaults],
  );
  const openSearchResultContextMenu = useCallback((event: MouseEvent<HTMLElement>, item: SearchResultBrowserItem) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item,
      x: Math.min(event.clientX, window.innerWidth - 208),
      y: Math.min(event.clientY, window.innerHeight - 288),
    });
  }, []);
  const getSearchResultContextMenuEntries = useCallback((item: SearchResultBrowserItem): BrowserContextMenuEntry[] => {
    const vaultId = getSearchItemVaultId(item);
    const canMutate = canMutateSearchItem(item);

    return [
      {
        key: 'open',
        label: 'Preview/open',
        icon: Eye,
        onSelect: () => navigate({ to: ROUTES.vaultDocument(vaultId, item.document.id), search: detailSearch as any }),
      },
      {
        key: 'download',
        label: 'Download',
        icon: Download,
        onSelect: () => downloadSearchResultDocument(item),
      },
      {
        key: 'rename',
        label: 'Rename',
        icon: Pencil,
        disabled: !canMutate,
        onSelect: () => {
          setRenameTarget(item);
          setRenameValue(item.document.name);
        },
      },
      {
        key: 'move',
        label: 'Move to',
        icon: MoveRight,
        disabled: !canMutate,
        onSelect: () => {
          setMoveTarget(item);
          setMoveDestinationId(item.document.folderId);
        },
      },
      {
        key: 'tags',
        label: 'Tags',
        icon: Tags,
        disabled: !canMutate,
        onSelect: () => navigate({ to: ROUTES.vaultDocumentMetadata(vaultId, item.document.id), search: detailSearch as any }),
      },
      {
        key: 'info',
        label: 'Info',
        icon: Info,
        onSelect: () => setInfoTarget(item),
      },
      {
        key: 'trash',
        label: 'Trash',
        icon: Trash2,
        tone: 'destructive',
        disabled: !canMutate || trashMutation.isPending,
        onSelect: () => setPendingTrashItem(item),
      },
    ];
  }, [canMutateSearchItem, detailSearch, navigate, trashMutation.isPending]);

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (renameTarget === null || renameValue.trim().length === 0) {
      return;
    }

    renameMutation.mutate({ target: renameTarget, name: renameValue.trim() });
  }

  function handleMoveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (moveTarget === null) {
      return;
    }

    moveMutation.mutate({ target: moveTarget, destinationId: moveDestinationId });
  }

  function confirmPendingTrash() {
    if (pendingTrashItem === null) {
      return;
    }

    trashMutation.mutate(pendingTrashItem);
  }

  const selectedVaultsLabel = useMemo(() => {
    if (selectedVaults.length === 0) {
      return 'All vaults';
    }

    if (selectedVaults.length <= 2) {
      return selectedVaults.map((vault) => vault.name).join(', ');
    }

    return `${selectedVaults[0].name}, ${selectedVaults[1].name} +${selectedVaults.length - 2}`;
  }, [selectedVaults]);

  const selectedTagsLabel = useMemo(() => {
    if (selectedTags.length === 0) {
      return 'All tags';
    }

    if (selectedTags.length <= 2) {
      return selectedTags.map((tag) => tag.name).join(', ');
    }

    return `${selectedTags[0].name}, ${selectedTags[1].name} +${selectedTags.length - 2}`;
  }, [selectedTags]);

  const setVaultSelection = useCallback(
    (nextVaultIds: string[]) => {
      updateFilters({
        vaultId: '',
        vaultIds: joinSearchList(nextVaultIds),
      });
    },
    [updateFilters],
  );

  const setTagSelection = useCallback(
    (nextTagIds: string[]) => {
      updateFilters({
        tagId: '',
        tagIds: joinSearchList(nextTagIds),
      });
    },
    [updateFilters],
  );

  const setSearchMode = useCallback(
    (value: SearchMode) => {
      updateFilters({
        searchMode: value,
      });
    },
    [updateFilters],
  );
  const filterStateKey = useMemo(
    () =>
      JSON.stringify({
        vaultIds: selectedVaultIds,
        tagIds: selectedTagIds,
        datePreset,
        dateFrom,
        dateTo,
      }),
    [dateFrom, datePreset, dateTo, selectedTagIds, selectedVaultIds],
  );

  const renderSearchControls = useCallback(
    (layout: 'workspace' | 'shell' | 'header') => (
      <DocumentSearchControls
        layout={layout}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search documents..."
        searchAriaLabel="Search documents"
        isFiltersOpen={isFiltersOpen}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCloseFilters={() => setIsFiltersOpen(false)}
        onResetFilters={resetFilters}
        activeFilterCount={activeFilters.length}
        activeFilters={activeFilters}
        onClearFilters={resetFilters}
        sortBy={sortBy}
        onSortChange={(value) => updateFilters({ sortBy: value })}
        sortOptions={sortOptions}
        sortSelectId="global-search-sort"
        sortAriaLabel="Sort search results"
        sortPlacement="input"
        filtersTitle="Filters"
        filterStateKey={filterStateKey}
        inlineAccessory={
          semanticSearchAvailable ? (
            <SearchModeControl value={selectedSearchMode} onValueChange={setSearchMode} />
          ) : undefined
        }
        trailingAccessory={
          layout === 'header' ? undefined : (
            <HStack flexShrink={0}>
              <FileBrowserViewToggle
                value={browserView}
                onValueChange={setBrowserView}
                size={layout === 'shell' ? 'sm' : 'md'}
              />
            </HStack>
          )
        }
        filtersContent={
          <>
            <SimpleGrid columns={1} gap="4">
              <SearchFilterMultiSelect
                label="Vaults"
                controlSize="toolbar"
                triggerLabel={selectedVaultsLabel}
                triggerAriaLabel="Vault filter"
                searchLabel="Search vaults"
                searchPlaceholder="Search vaults"
                emptyLabel="No vaults found."
                loadingLabel="Loading vaults..."
                options={vaults.map((vault) => ({
                  value: vault.id,
                  label: vault.name,
                }))}
                selectedValues={selectedVaultIds}
                isLoading={vaultsQuery.isLoading}
                onValueChange={setVaultSelection}
                onClear={() => updateFilters({ vaultId: '', vaultIds: '' })}
              />

              <SearchFilterMultiSelect
                label="Tags"
                triggerLabel={selectedTagsLabel}
                triggerAriaLabel="Tags filter"
                searchLabel="Search tags"
                searchPlaceholder="Search tags"
                emptyLabel="No tags found."
                loadingLabel="Loading tags..."
                options={tags.map((tag) => ({
                  value: tag.id,
                  label: tag.name,
                  color: tag.color,
                  meta:
                    typeof tag.documentsCount === 'number'
                      ? `${tag.documentsCount} doc${tag.documentsCount === 1 ? '' : 's'}`
                      : undefined,
                }))}
                selectedValues={selectedTagIds}
                isLoading={tagsQuery.isLoading}
                onValueChange={setTagSelection}
                onClear={() => updateFilters({ tagId: '', tagIds: '' })}
                showColorSwatch
              />
            </SimpleGrid>

            <DatePresetSelector
              idPrefix="global-search-date-filter"
              value={datePreset}
              onValueChange={setPresetDateFilter}
              customDateFrom={dateFrom}
              customDateTo={dateTo}
              onCustomDateFromChange={(nextValue) => {
                setDatePreset('custom');
                updateFilters({ dateFrom: nextValue });
              }}
              onCustomDateToChange={(nextValue) => {
                setDatePreset('custom');
                updateFilters({ dateTo: nextValue });
              }}
            />
          </>
        }
      />
    ),
    [
      activeFilters,
      browserView,
      dateFrom,
      datePreset,
      dateTo,
      filterStateKey,
      isFiltersOpen,
      query,
      resetFilters,
      semanticSearchAvailable,
      selectedSearchMode,
      selectedTagIds,
      selectedTagsLabel,
      selectedVaultIds,
      selectedVaultsLabel,
      setPresetDateFilter,
      setBrowserView,
      setSearchMode,
      setTagSelection,
      setVaultSelection,
      sortBy,
      tagsQuery.isLoading,
      tags,
      updateFilters,
      vaults,
      vaultsQuery.isLoading,
    ],
  );
  const searchHeaderControls = useMemo(
    () => renderSearchControls('header'),
    [renderSearchControls],
  );
  const searchHeaderActions = useMemo(
    () => <FileBrowserViewToggle value={browserView} onValueChange={setBrowserView} size="sm" />,
    [browserView, setBrowserView],
  );
  const workspaceHeader = useMemo(
    () => ({
      left: searchHeaderControls,
      actions: searchHeaderActions,
    }),
    [searchHeaderActions, searchHeaderControls],
  );
  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);
  const pageSearchControls = useMemo(
    () => renderSearchControls('workspace'),
    [renderSearchControls],
  );

  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden" bg="bg.workspace">
      {!isInWorkspaceShell ? pageSearchControls : null}

      <Flex flex="1" minH="0" direction="column" overflow="hidden" bg="bg.workspace">
        {!hasActiveSearch ? (
          <CenteredEmptyState
            title="Search your documents"
            icon={<FileSearch size={32} />}
            colorPalette="teal"
            containerProps={{ flex: '1', minH: '0', px: '6', py: '10' }}
          />
        ) : (
          <Flex flex="1" minH="0" direction="column" overflow="hidden">
            {searchQuery.isError ? (
              <Box px={{ base: '4', lg: '6' }} py="5">
                <Text fontSize="sm" color="fg.error">
                  Unable to search your vaults.
                </Text>
              </Box>
            ) : null}

            {!searchQuery.isLoading && !searchQuery.isError && results.length === 0 ? (
              <CenteredEmptyState
                title="No matches found"
                description="Adjust the query or filters and try again."
                icon={<SearchX size={24} />}
                rounded="lg"
                borderWidth="1px"
                borderStyle="dashed"
                borderColor="border.surface"
                bg="bg.surface"
                p="6"
                containerProps={{
                  flex: '1',
                  minH: '22rem',
                  px: { base: '4', lg: '6' },
                  py: '8',
                }}
              />
            ) : null}

            {results.length > 0 ? (
              browserView === 'list' ? (
                <SearchResultList
                  results={results}
                  detailSearch={detailSearch}
                  onOpenContextMenu={openSearchResultContextMenu}
                  query={debouncedQuery}
                />
              ) : (
                <SearchResultGrid
                  results={results}
                  detailSearch={detailSearch}
                  onOpenContextMenu={openSearchResultContextMenu}
                />
              )
            ) : null}
          </Flex>
        )}
      </Flex>
      <RenameItemDialog
        open={renameTarget !== null}
        target={renameTarget}
        value={renameValue}
        isPending={renameMutation.isPending}
        onValueChange={setRenameValue}
        onClose={() => {
          setRenameTarget(null);
          setRenameValue('');
        }}
        onSubmit={handleRenameSubmit}
      />
      <MoveItemDialog
        open={moveTarget !== null}
        target={moveTarget}
        value={moveDestinationId}
        destinations={moveDestinations}
        isPending={moveMutation.isPending}
        isLoading={folderTreeQuery.isLoading}
        onValueChange={setMoveDestinationId}
        onClose={() => {
          setMoveTarget(null);
          setMoveDestinationId(null);
        }}
        onSubmit={handleMoveSubmit}
      />
      <ItemInfoDialog
        open={infoTarget !== null}
        target={infoTarget}
        folderPath={(infoTarget?.document as SearchResultBrowserItem['document'] | undefined)?.vaultName ?? 'Search result'}
        onClose={() => setInfoTarget(null)}
      />
      <SearchTrashConfirmDialog
        item={pendingTrashItem}
        isPending={trashMutation.isPending}
        onClose={() => setPendingTrashItem(null)}
        onConfirm={confirmPendingTrash}
      />
      {contextMenu !== null ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getSearchResultContextMenuEntries(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Flex>
  );
}

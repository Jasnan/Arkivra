/* eslint-disable react-refresh/only-export-components */
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, MouseEvent } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import type { VirtuosoGridProps } from 'react-virtuoso';
import {
  Box,
  CloseButton,
  Dialog as ChakraDialog,
  Flex,
  Grid,
  Menu,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Check, ChevronDown, Sparkles, Vault } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Button } from '@/components/ui/button';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import { getDocumentDownloadUrl } from '@/features/documents/documents.api';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import {
  FileBrowserIcon,
  GridItemName,
} from '@/features/file-browser/components/vault-browser-components';
import { getFileDisplayName } from '@/features/file-browser/components/vault-browser.types';
import type { BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import type { SearchMode, SearchResultItem } from '@/features/search/search.types';
import { TagBadge } from '@/features/tags/components/tag-badge';
import { formatDateRange } from '@/lib/localization';

const SEARCH_TERM_SEPARATOR = /\s+/;
const SNIPPET_WHITESPACE = /\s+/g;
const SEARCH_RESULT_COLUMNS =
  'minmax(0, 1fr) minmax(7rem, 9rem) minmax(5.5rem, 7rem) minmax(8rem, 10rem)';
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

type SearchResultBrowserDocument = Extract<BrowserItem, { type: 'document' }>['document'] & {
  vaultId: string;
  vaultName: string;
};

export type SearchResultBrowserItem = Extract<BrowserItem, { type: 'document' }> & {
  type: 'document';
  document: SearchResultBrowserDocument;
};

export type SearchResultContextMenuState = {
  item: SearchResultBrowserItem;
  x: number;
  y: number;
} | null;

export function searchResultToBrowserItem(result: SearchResultItem): SearchResultBrowserItem {
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

export function getSearchItemVaultId(item: SearchResultBrowserItem) {
  return item.document.vaultId;
}

export function downloadSearchResultDocument(item: SearchResultBrowserItem) {
  const link = window.document.createElement('a');
  link.href = getDocumentDownloadUrl({
    vaultId: getSearchItemVaultId(item),
    documentId: item.document.id,
  });
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

export function SearchResultList({
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

export function SearchResultGrid({
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
          result ? (
            <SearchResultGridCard
              result={result}
              detailSearch={detailSearch}
              onOpenContextMenu={onOpenContextMenu}
            />
          ) : null
        }
      />
    </Box>
  );
}

export function SearchModeControl({
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
                borderWidth="1px"
                borderColor={value === 'hybrid' ? 'teal.muted' : 'transparent'}
                _checked={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
                _highlighted={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
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
                borderWidth="1px"
                borderColor={value === 'keyword' ? 'teal.muted' : 'transparent'}
                _checked={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
                _highlighted={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
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

export function buildPresetRange(preset: Exclude<DatePreset, 'custom'>) {
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

export function getDateFilterLabel({
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

export function SearchTrashConfirmDialog({
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

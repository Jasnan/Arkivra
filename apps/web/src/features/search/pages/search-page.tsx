import { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Grid, Stack, Switch as ChakraSwitch, Text } from '@chakra-ui/react';
import { Check, FileSearch, FileText, SearchX, Vault, X } from 'lucide-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentSearchControls,
  SearchFilterMultiSelect,
} from '@/features/documents/components/document-search-controls';
import type { DocumentSearchControlFilter } from '@/features/documents/components/document-search-controls';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import type { SearchMode, SearchResultItem, SearchSortBy } from '@/features/search/search.types';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const SEARCH_RESULT_LIMIT = 25;
const SEARCH_QUERY_DEBOUNCE_MS = 280;
const SEARCH_TERM_SEPARATOR = /\s+/;
const SNIPPET_WHITESPACE = /\s+/g;
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
];
const SEARCH_RESULT_COLUMNS = 'minmax(0, 1fr) minmax(7rem, 9rem) minmax(5.5rem, 7rem) minmax(8rem, 10rem)';
const SEARCH_RETURN_SOURCE = 'search';
const SEARCH_LIST_SEPARATOR = ',';

function getDocumentTypeLabel({ name, mimeType }: { name: string; mimeType: string }) {
  const extension = name.split('.').pop()?.trim().toUpperCase();

  if (extension && extension.length <= 5) {
    return extension;
  }

  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'XLS';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
  if (mimeType.startsWith('text/')) return 'TXT';

  return 'FILE';
}

function FileTypeBadge({ name, mimeType }: { name: string; mimeType: string }) {
  return (
    <Flex
      boxSize="9"
      shrink={0}
      align="center"
      justify="center"
      rounded="lg"
      borderWidth="1px"
      borderColor="border.subtle"
      bg="bg.surface"
      color="fg.muted"
      aria-hidden="true"
    >
      <Stack align="center" gap="0" lineHeight="none">
        <FileText size={14} />
        <Text as="span" fontSize="0.58rem" fontWeight="bold">
          {getDocumentTypeLabel({ name, mimeType })}
        </Text>
      </Stack>
    </Flex>
  );
}

function ResultTagPill({ name, color }: { name: string; color: string | null }) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      rounded="md"
      px="2"
      py="0.5"
      fontSize="xs"
      fontWeight="medium"
      bg={color ? `${color}18` : 'bg.subtle'}
      color={color ?? 'fg.muted'}
    >
      {name}
    </Box>
  );
}

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
  if (searchMode === 'keyword') params.searchMode = searchMode;

  return params;
}

function parseSearchList(value: string | undefined) {
  return Array.from(
    new Set((value ?? '').split(SEARCH_LIST_SEPARATOR).map((item) => item.trim()).filter(Boolean)),
  );
}

function joinSearchList(values: string[]) {
  return values.join(SEARCH_LIST_SEPARATOR);
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
        (nextStart === -1 || termIndex < nextStart || (termIndex === nextStart && term.length > nextTerm.length))
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
      parts.push({ key: `${parts.length}-${index}`, text: text.slice(index, nextStart), highlighted: false });
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
  return value
    .replace(SNIPPET_WHITESPACE, ' ')
    .trim();
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
          <Box as="span" rounded="md" bg="bg.subtle" px="2" py="0.5" fontSize="xs" lineHeight="1.2" color="fg.muted">
            Semantic match
          </Box>
        ) : null}
        {result.bestChunk.pageNumber !== null ? (
          <Box as="span" rounded="md" bg="bg.subtle" px="2" py="0.5" fontSize="xs" lineHeight="1.2" color="fg.muted">
            Page {result.bestChunk.pageNumber}
          </Box>
        ) : null}
        <Box as="span" rounded="md" bg="bg.subtle" px="2" py="0.5" fontSize="xs" lineHeight="1.2" color="fg.muted">
          {result.matchedChunksCount} {chunkCountLabel}{result.matchedChunksCount === 1 ? '' : 's'}
        </Box>
        {result.bestChunk.chunkType ? (
          <Box as="span" rounded="md" bg="bg.subtle" px="2" py="0.5" fontSize="xs" lineHeight="1.2" color="fg.muted">
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
  query,
}: {
  result: SearchResultItem;
  detailSearch: Record<string, string>;
  query: string;
}) {
  const documentTo = ROUTES.vaultDocument(result.vaultId, result.documentId);
  const visibleTags = (result.tags ?? []).slice(0, 2);
  const remainingTagsCount = Math.max(0, (result.tags ?? []).length - visibleTags.length);

  return (
    <Link
      to={documentTo}
      search={detailSearch as any}
      style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
      aria-label={`Open ${result.name}`}
    >
      <Grid
        as="article"
        alignItems="start"
        templateColumns={{ base: '1fr', md: SEARCH_RESULT_COLUMNS }}
        gap={{ base: '3', xl: '4' }}
        borderBottomWidth="1px"
        borderColor="border.subtle"
        bg="bg.workspace"
        px={{ base: '4', lg: '6' }}
        py="var(--arkivra-rowPaddingY, 0.875rem)"
        minH="var(--arkivra-listRowHeight, 4.5rem)"
        cursor="pointer"
        transition="background-color 0.15s ease"
        _hover={{ bg: 'bg.workspaceMuted' }}
      >
        <Flex minW="0" maxW="full" overflow="hidden" align="flex-start" gap="3">
          <FileTypeBadge name={result.name} mimeType={result.mimeType} />
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
                <ResultTagPill key={tag.id} name={tag.name} color={tag.color} />
              ))}
              {remainingTagsCount > 0 ? (
                <Box as="span" rounded="md" bg="bg.subtle" px="2" py="0.5" fontSize="xs" color="fg.muted">
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
          <Text fontSize="xs" color="fg.muted">
            {result.mimeType}
          </Text>
        </Stack>

        <Stack gap="1" minW="0">
          <Text fontSize="sm" color="fg">
            {formatDate(result.updatedAt)}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            Document date: {formatDate(result.documentDate)}
          </Text>
        </Stack>
      </Grid>
    </Link>
  );
}

function SearchModeControl({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Flex
      w="full"
      minH="calc(var(--arkivra-controlHeight, 2.5rem) + 0.25rem)"
      align="center"
      justify="space-between"
      gap="3"
      rounded="lg"
      borderWidth="1px"
      borderColor="border.subtle"
      bg="bg.surface"
      px="3"
      py="2"
      fontSize="sm"
      color="fg"
    >
      <Flex minW="0" align="center" justify="flex-end" gap="1.5">
        <ChakraSwitch.Root
          size="lg"
          colorPalette="teal"
          checked={checked}
          onCheckedChange={(event) => onCheckedChange(event.checked)}
          display="flex"
          flex="1"
          alignItems="center"
          justifyContent="space-between"
          gap="3"
        >
          <ChakraSwitch.HiddenInput />
          <ChakraSwitch.Label flexShrink={0} fontWeight="medium" color="fg.muted">
            Semantic search
          </ChakraSwitch.Label>
          <ChakraSwitch.Control>
            <ChakraSwitch.Thumb>
              <ChakraSwitch.ThumbIndicator fallback={<X size={12} color="black" />}>
                <Check size={12} />
              </ChakraSwitch.ThumbIndicator>
            </ChakraSwitch.Thumb>
          </ChakraSwitch.Control>
        </ChakraSwitch.Root>
        <InfoTooltip
          label="Semantic search help"
          content="Finds documents by similar meaning, even when the exact words differ. The technical term is semantic search. Turn it off for exact keyword matching only."
        />
      </Flex>
    </Flex>
  );
}

function isSearchSortBy(value: string | undefined): value is SearchSortBy {
  return value === 'created_desc'
    || value === 'created_asc'
    || value === 'name_asc'
    || value === 'name_desc';
}

function isSearchMode(value: string | undefined): value is SearchMode {
  return value === 'keyword' || value === 'hybrid';
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
  if (!dateFrom && !dateTo) {
    return 'Any time';
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const fromLabel = dateFrom ? formatter.format(new Date(`${dateFrom}T00:00:00`)) : 'Start';
  const toLabel = dateTo ? formatter.format(new Date(`${dateTo}T00:00:00`)) : 'Now';

  return `${fromLabel} - ${toLabel}`;
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

export function SearchPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string>;
  const [query, setQuery] = useState(search.q ?? '');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>(search.dateFrom || search.dateTo ? 'custom' : 'any');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_QUERY_DEBOUNCE_MS);

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
  const sortBy = isSearchSortBy(search.sortBy) ? search.sortBy : 'created_desc';
  const semanticSearchEnabled = isSearchMode(search.searchMode) ? search.searchMode !== 'keyword' : true;
  const selectedSearchMode: SearchMode = semanticSearchEnabled ? 'hybrid' : 'keyword';
  const searchMode: SearchMode = selectedSearchMode === 'hybrid' && debouncedQuery.length > 0 ? 'hybrid' : 'keyword';

  useEffect(() => {
    if ((search.q ?? '') === debouncedQuery) {
      return;
    }

    navigate({
      search: (prev: Record<string, string>) => {
        const next: Record<string, string> = { ...prev }
        if (debouncedQuery.length > 0) {
          next.q = debouncedQuery
        } else {
          delete next.q
        }
        delete next.pageIndex
        return next
      },
      replace: true,
    } as any)
  }, [debouncedQuery, navigate, search.q]);

  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useAccessibleTagsQuery();
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
    enabled:
      debouncedQuery.length > 0 ||
      selectedVaultIds.length > 0 ||
      selectedTagIds.length > 0 ||
      dateFrom.length > 0 ||
      dateTo.length > 0,
  });

  const selectedVaults = useMemo(
    () => (vaultsQuery.data?.vaults ?? []).filter((vault) => selectedVaultIds.includes(vault.id)),
    [selectedVaultIds, vaultsQuery.data?.vaults],
  );
  const selectedTags = useMemo(
    () => (tagsQuery.data?.tags ?? []).filter((tag) => selectedTagIds.includes(tag.id)),
    [selectedTagIds, tagsQuery.data?.tags],
  );

  function updateFilters(nextValues: Record<string, string>) {
    navigate({
      search: (prev: Record<string, string>) => {
        const next: Record<string, string> = { ...prev }
        for (const [key, value] of Object.entries(nextValues)) {
          if (value) next[key] = value
          else delete next[key]
        }
        delete next.pageIndex
        return next
      },
      replace: true,
    } as any)
  }

  function resetFilters() {
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
  }

  function setPresetDateFilter(value: DatePreset) {
    setDatePreset(value);

    if (value === 'custom') {
      return;
    }

    const range = buildPresetRange(value);
    updateFilters(range);
  }

  const activeFilters: DocumentSearchControlFilter[] = [
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
      ? [{
          key: 'date-range',
          label: getDateFilterLabel({ preset: datePreset, dateFrom, dateTo }),
          onRemove: () => {
            setDatePreset('any');
            updateFilters({ dateFrom: '', dateTo: '' });
          },
        }]
      : []),
  ];
  const hasActiveSearch = debouncedQuery.length > 0 || activeFilters.length > 0;
  const results = searchQuery.data?.results ?? [];
  const resultCount = searchQuery.data?.resultsCount ?? 0;
  const shownCount = results.length;
  const matchLabel = resultCount > shownCount && shownCount > 0
    ? `${shownCount} of ${resultCount} matches`
    : `${resultCount} match${resultCount === 1 ? '' : 'es'}`;
  const detailSearch = getSearchReturnParams({
    query: debouncedQuery,
    vaultIds: selectedVaultIds,
    tagIds: selectedTagIds,
    dateFrom,
    dateTo,
    sortBy,
    searchMode: selectedSearchMode,
  });

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

  function setVaultSelection(nextVaultIds: string[]) {
    updateFilters({
      vaultId: '',
      vaultIds: joinSearchList(nextVaultIds),
    });
  }

  function setTagSelection(nextTagIds: string[]) {
    updateFilters({
      tagId: '',
      tagIds: joinSearchList(nextTagIds),
    });
  }

  function setSemanticSearchEnabled(checked: boolean) {
    updateFilters({
      searchMode: checked ? '' : 'keyword',
    });
  }

  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden" bg="bg.workspace">
      <DocumentSearchControls
        layout="workspace"
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
        filtersTitle="Filters"
        toolbarAccessory={(
          <SearchModeControl
            checked={semanticSearchEnabled}
            onCheckedChange={setSemanticSearchEnabled}
          />
        )}
        filtersContent={
          <>
            <SearchFilterMultiSelect
              label="Vaults"
              triggerLabel={selectedVaultsLabel}
              triggerAriaLabel="Vault filter"
              searchLabel="Search vaults"
              searchPlaceholder="Search vaults"
              emptyLabel="No vaults found."
              loadingLabel="Loading vaults..."
              options={(vaultsQuery.data?.vaults ?? []).map((vault) => ({
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
              options={(tagsQuery.data?.tags ?? []).map((tag) => ({
                value: tag.id,
                label: tag.name,
                color: tag.color,
                meta: typeof tag.documentsCount === 'number'
                  ? `${tag.documentsCount} doc${tag.documentsCount === 1 ? '' : 's'}`
                  : undefined,
              }))}
              selectedValues={selectedTagIds}
              isLoading={tagsQuery.isLoading}
              onValueChange={setTagSelection}
              onClear={() => updateFilters({ tagId: '', tagIds: '' })}
              showColorSwatch
            />

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="fg">
                Uploaded date
              </Text>
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
            </Box>
          </>
        }
      />

      <Box flex="1" minH="0" overflowY="auto" bg="bg.workspace">
        {!hasActiveSearch ? (
          <Flex h="full" minH="0" align="center" justify="center" px="6" py="10">
            <Stack align="center" gap="3" maxW="md" color="fg.muted" textAlign="center">
              <Box color="teal.solid" aria-hidden="true">
                <FileSearch size={32} />
              </Box>
              <Text fontWeight="semibold" color="fg">
                Search your documents
              </Text>
            </Stack>
          </Flex>
        ) : (
          <>
            <Flex
              align={{ base: 'stretch', md: 'center' }}
              direction={{ base: 'column', md: 'row' }}
              justify="space-between"
              gap="3"
              borderBottomWidth="1px"
              borderColor="border.subtle"
              bg="bg.workspace"
              px={{ base: '4', lg: '6' }}
              py="3"
            >
              <Stack gap="0.5">
                <Text fontSize="sm" fontWeight="semibold" color="fg">
                  Matches
                </Text>
              </Stack>
              <Box
                alignSelf={{ base: 'flex-start', md: 'center' }}
                rounded="full"
                bg="bg.surface"
                borderWidth="1px"
                borderColor="border.subtle"
                px="3"
                py="1"
                fontSize="xs"
                fontWeight="semibold"
                color="fg"
              >
                {searchQuery.isLoading ? 'Searching...' : matchLabel}
              </Box>
            </Flex>

            {searchQuery.isError ? (
              <Box px={{ base: '4', lg: '6' }} py="5">
                <Text fontSize="sm" color="fg.error">Unable to search your vaults.</Text>
              </Box>
            ) : null}

            {!searchQuery.isLoading && !searchQuery.isError && results.length === 0 ? (
              <Flex px={{ base: '4', lg: '6' }} py="8">
                <Stack
                  align="center"
                  gap="3"
                  w="full"
                  rounded="lg"
                  borderWidth="1px"
                  borderStyle="dashed"
                  borderColor="border.subtle"
                  bg="bg.surface"
                  p="6"
                  color="fg.muted"
                  textAlign="center"
                >
                  <SearchX size={24} />
                  <Text fontWeight="semibold" color="fg">
                    No matches found
                  </Text>
                  <Text fontSize="sm">
                    Adjust the query or filters and try again.
                  </Text>
                </Stack>
              </Flex>
            ) : null}

            {results.length > 0 ? (
              <>
                <Grid
                  display={{ base: 'none', md: 'grid' }}
                  position="sticky"
                  top="0"
                  zIndex="1"
                  templateColumns={SEARCH_RESULT_COLUMNS}
                  gap="4"
                  borderBottomWidth="1px"
                  borderColor="border.subtle"
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

                {results.map((result) => (
                  <SearchResultRow
                    key={`${result.vaultId}-${result.documentId}`}
                    result={result}
                    detailSearch={detailSearch}
                    query={debouncedQuery}
                  />
                ))}

              </>
            ) : null}
          </>
        )}
      </Box>
    </Flex>
  );
}

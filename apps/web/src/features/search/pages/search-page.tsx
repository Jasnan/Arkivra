import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react';
import { Archive, ArrowRight, Search as SearchIcon, Tags, Vault } from 'lucide-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import {
  PageIntro,
  SectionTitle,
  StatCard,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import { DocumentSearchControls } from '@/features/documents/components/document-search-controls';
import type { DocumentSearchControlFilter } from '@/features/documents/components/document-search-controls';
import { formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { stripSnippetMarkup, tokenizeSnippet } from '@/features/search/search.utils';
import type { SearchSortBy } from '@/features/search/search.types';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

const PAGE_SIZE = 10;
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
];

function isSearchSortBy(value: string | undefined): value is SearchSortBy {
  return value === 'created_desc'
    || value === 'created_asc'
    || value === 'name_asc'
    || value === 'name_desc';
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
  const deferredQuery = useDeferredValue(query.trim());

  const vaultId = search.vaultId ?? '';
  const tagId = search.tagId ?? '';
  const dateFrom = search.dateFrom ?? '';
  const dateTo = search.dateTo ?? '';
  const sortBy = isSearchSortBy(search.sortBy) ? search.sortBy : 'created_desc';
  const pageIndex = Number.parseInt(search.pageIndex ?? '0', 10) || 0;

  useEffect(() => {
    navigate({
      search: (prev: Record<string, string>) => {
        const next: Record<string, string> = { ...prev }
        if (query.trim().length > 0) {
          next.q = query.trim()
        } else {
          delete next.q
        }
        next.pageIndex = '0'
        return next
      },
      replace: true,
    } as any)
  }, [query, navigate]);

  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useAccessibleTagsQuery({ vaultId: vaultId || undefined });
  const searchQuery = useGlobalSearchDocumentsQuery({
    query: deferredQuery,
    pageIndex,
    pageSize: PAGE_SIZE,
    vaultId: vaultId || undefined,
    tagId: tagId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    enabled:
      deferredQuery.length > 0 ||
      vaultId.length > 0 ||
      tagId.length > 0 ||
      dateFrom.length > 0 ||
      dateTo.length > 0,
  });

  const totalPages = useMemo(() => {
    const count = searchQuery.data?.resultsCount ?? 0;
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }, [searchQuery.data?.resultsCount]);

  const selectedVault = (vaultsQuery.data?.vaults ?? []).find((vault) => vault.id === vaultId);
  const selectedTag = (tagsQuery.data?.tags ?? []).find((tag) => tag.id === tagId);

  function updateFilters(nextValues: Record<string, string>) {
    navigate({
      search: (prev: Record<string, string>) => {
        const next: Record<string, string> = { ...prev }
        for (const [key, value] of Object.entries(nextValues)) {
          if (value) next[key] = value
          else delete next[key]
        }
        next.pageIndex = '0'
        return next
      },
      replace: true,
    } as any)
  }

  function resetFilters() {
    setDatePreset('any');
    updateFilters({ vaultId: '', tagId: '', dateFrom: '', dateTo: '', sortBy: 'created_desc' });
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
    ...(selectedVault
      ? [{
          key: `vault-${selectedVault.id}`,
          label: selectedVault.name,
          onRemove: () => updateFilters({ vaultId: '' }),
        }]
      : []),
    ...(selectedTag
      ? [{
          key: `tag-${selectedTag.id}`,
          label: selectedTag.name,
          onRemove: () => updateFilters({ tagId: '' }),
        }]
      : []),
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
  const hasActiveSearch = deferredQuery.length > 0 || activeFilters.length > 0;

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Global Discovery"
        title="Search across vaults"
        description="Run full-text discovery across every vault you can access, then narrow results by vault, tag, or document date."
      />

      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}>
        <StatCard
          label="Accessible vaults"
          value={(vaultsQuery.data?.vaults ?? []).length}
          meta="Search spans only the workspaces your account can reach."
          icon={<Vault size={20} />}
        />
        <StatCard
          label="Current scope"
          value={vaultId ? 'Focused' : 'All vaults'}
          meta={
            vaultId
              ? 'Results are limited to one selected vault.'
              : 'Results can come from any accessible vault.'
          }
          icon={<Archive size={20} />}
        />
        <StatCard
          label="Matches"
          value={hasActiveSearch ? (searchQuery.data?.resultsCount ?? 0) : 0}
          meta={
            hasActiveSearch
              ? 'Count updates as search terms and filters change.'
              : 'Start typing to query extracted text.'
          }
          icon={<SearchIcon size={20} />}
        />
      </Grid>

      <DocumentSearchControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search invoices, clauses, names..."
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
        filtersTitle="Search filters"
        filtersContent={
          <>
            <Box>
              <Text as="span" id="search-vault-label" fontSize="sm" fontWeight="semibold" color="fg">
                Vault
              </Text>
              <Select
                value={vaultId || '__all__'}
                onValueChange={(value) => {
                  const nextVaultId = value === '__all__' ? '' : value;
                  updateFilters({ vaultId: nextVaultId });
                }}
              >
                <SelectTrigger aria-labelledby="search-vault-label" h="10" rounded="lg" borderColor="border.subtle" bg="bg.surface" mt="3">
                  <SelectValue placeholder="All vaults" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All vaults</SelectItem>
                  {(vaultsQuery.data?.vaults ?? []).map((vault) => (
                    <SelectItem key={vault.id} value={vault.id}>
                      {vault.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>

            <Box>
              <Text as="span" id="search-tag-label" fontSize="sm" fontWeight="semibold" color="fg">
                Tag
              </Text>
              <Select
                value={tagId || '__all__'}
                onValueChange={(value) => updateFilters({ tagId: value === '__all__' ? '' : value })}
              >
                <SelectTrigger aria-labelledby="search-tag-label" h="10" rounded="lg" borderColor="border.subtle" bg="bg.surface" mt="3">
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tags</SelectItem>
                  {(tagsQuery.data?.tags ?? []).map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="fg">
                Date
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

      {!hasActiveSearch ? (
        <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="3">
          <Text textStyle="label">Discovery Idle</Text>
          <Text fontSize="sm" lineHeight="6" color="fg.muted">
            Start typing to search extracted text across all accessible vaults.
          </Text>
        </SurfacePanel>
      ) : (
        <SurfacePanel display="flex" flexDirection="column" gap="5">
          <SectionTitle
            eyebrow="Search Results"
            title="Matches"
            action={
              <Box
                display="inline-flex"
                alignItems="center"
                gap="1.5"
                rounded="full"
                bg="bg.subtle"
                px="3"
                py="1"
                fontSize="xs"
                fontWeight="semibold"
                color="fg"
              >
                {searchQuery.data?.resultsCount ?? 0} matches
              </Box>
            }
          />

          {searchQuery.isLoading ? (
            <Text fontSize="sm" color="fg.muted">Searching...</Text>
          ) : null}
          {searchQuery.isError ? (
            <Text fontSize="sm" color="fg.error">Unable to search your vaults.</Text>
          ) : null}

          {!searchQuery.isLoading && (searchQuery.data?.results.length ?? 0) === 0 ? (
            <Box rounded="lg" borderWidth="1px" borderStyle="dashed" borderColor="border" bg="bg.subtle" p="4" color="fg.muted">
              No documents matched your query and filters.
            </Box>
          ) : (
            <Stack gap="4">
              {(searchQuery.data?.results ?? []).map((result) => (
                <Box
                  key={`${result.vaultId}-${result.documentId}`}
                  rounded="lg"
                  bg="bg.subtle"
                  p="5"
                >
                  <Stack gap="4">
                    <Flex
                      direction={{ base: 'column', lg: 'row' }}
                      align={{ lg: 'flex-start' }}
                      justify={{ lg: 'space-between' }}
                      gap="3"
                    >
                      <Stack gap="3">
                        <Box>
                          <Link
                            to={ROUTES.vaultDocument(result.vaultId, result.documentId)}
                            style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--chakra-colors-fg)' }}
                          >
                            {result.name}
                          </Link>
                          <Text mt="2" fontSize="sm" color="fg.muted">
                            {result.vaultName} • {result.mimeType} • {result.matchedChunksCount}{' '}
                            matching chunk{result.matchedChunksCount === 1 ? '' : 's'} • Updated{' '}
                            {formatDate(result.updatedAt)}
                          </Text>
                          <Text fontSize="sm" color="fg.muted">
                            Document date: {formatDate(result.documentDate)}
                          </Text>
                        </Box>

                        <Flex gap="2" flexWrap="wrap">
                          <Flex
                            display="inline-flex"
                            align="center"
                            gap="1.5"
                            rounded="full"
                            bg="bg.subtle"
                            px="3"
                            py="1"
                            fontSize="xs"
                            fontWeight="semibold"
                            color="fg"
                          >
                            <Vault size={14} />
                            <Text as="span">{result.vaultName}</Text>
                          </Flex>
                          {result.bestChunk ? (
                            <Flex
                              display="inline-flex"
                              align="center"
                              gap="1.5"
                              rounded="full"
                              bg="bg.subtle"
                              px="3"
                              py="1"
                              fontSize="xs"
                              fontWeight="semibold"
                              color="fg"
                            >
                              <Tags size={14} />
                              <Text as="span">{result.bestChunk.chunkType ?? 'text chunk'}</Text>
                            </Flex>
                          ) : null}
                        </Flex>
                      </Stack>

                      <Link
                        to={ROUTES.vaultDocument(result.vaultId, result.documentId)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--chakra-colors-teal-solid)', fontWeight: 600, fontSize: '0.875rem' }}
                      >
                        Open document
                        <ArrowRight size={16} />
                      </Link>
                    </Flex>

                    {result.bestChunk ? (
                      <>
                        <Box rounded="lg" bg="bg.surface" p="4" fontSize="sm" lineHeight="7" color="fg">
                          <Text textStyle="label" mb="3">
                            Best matching snippet
                            {result.bestChunk.pageNumber !== null
                              ? ` • Page ${result.bestChunk.pageNumber}`
                              : ''}
                          </Text>
                          <Box wordBreak="break-word">
                            {tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                              part.highlighted ? (
                                <Box
                                  as="mark"
                                  key={`${result.documentId}-${part.key}`}
                                  rounded="md"
                                  bg="teal.subtle"
                                  px="1.5"
                                  py="0.5"
                                  color="fg"
                                >
                                  {part.text}
                                </Box>
                              ) : (
                                <Text as="span" key={`${result.documentId}-${part.key}`}>{part.text}</Text>
                              ),
                            )}
                          </Box>
                        </Box>

                        <Box
                          as="details"
                          rounded="lg"
                          bg="bg.subtle"
                          p="4"
                          fontSize="sm"
                          color="fg.muted"
                        >
                          <Box
                            as="summary"
                            cursor="pointer"
                            fontWeight="semibold"
                            color="fg"
                          >
                            Matched chunk preview
                          </Box>
                          <Text mt="3" whiteSpace="pre-wrap" wordBreak="break-word" lineHeight="6">
                            {stripSnippetMarkup(result.bestChunk.content)}
                          </Text>
                        </Box>
                      </>
                    ) : null}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'center' }}
            justify={{ base: 'flex-start', sm: 'space-between' }}
            gap="3"
            pt="2"
          >
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.24em" color="fg.muted">
              Page {pageIndex + 1} of {totalPages}
            </Text>
            <Flex gap="2">
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() => {
                  navigate({
                    search: (prev: Record<string, string>) => ({ ...prev, pageIndex: String(Math.max(0, pageIndex - 1)) }),
                    replace: true,
                  } as any)
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex >= totalPages - 1}
                onClick={() => {
                  navigate({
                    search: (prev: Record<string, string>) => ({ ...prev, pageIndex: String(Math.min(totalPages - 1, pageIndex + 1)) }),
                    replace: true,
                  } as any)
                }}
              >
                Next
              </Button>
            </Flex>
          </Flex>
        </SurfacePanel>
      )}
    </Stack>
  );
}

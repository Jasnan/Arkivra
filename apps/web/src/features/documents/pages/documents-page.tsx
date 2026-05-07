import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import { Upload } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PageIntro,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { softDeleteDocument } from '@/features/documents/documents.api';
import {
  DocumentLibraryHeader,
  DocumentLibraryRow,
} from '@/features/documents/components/document-library-list';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentSearchControls,
} from '@/features/documents/components/document-search-controls';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import { searchQueryKeys, useVaultSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 8;
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
];
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
    return { dateFrom: undefined, dateTo: undefined };
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

export function DocumentsPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? '';
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SearchSortBy>('created_desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const debouncedSearchText = useDebouncedValue(searchText.trim(), 280);
  const appliedDateRange = useMemo(() => {
    if (datePreset === 'custom') {
      return {
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
      };
    }

    return buildPresetRange(datePreset);
  }, [customDateFrom, customDateTo, datePreset]);

  const documentsQuery = useDocumentsQuery({
    vaultId,
    tagId: selectedTagId || undefined,
    sortBy,
  });
  const tagsQuery = useTagsQuery({ vaultId });
  const searchQuery = useVaultSearchDocumentsQuery({
    vaultId,
    query: debouncedSearchText,
    pageIndex,
    pageSize: PAGE_SIZE,
    tagId: selectedTagId || undefined,
    dateFrom: appliedDateRange.dateFrom,
    dateTo: appliedDateRange.dateTo,
    sortBy,
    enabled: debouncedSearchText.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const filteredDocuments = useMemo(
    () =>
      (documentsQuery.data?.documents ?? []).filter((document) => {
        const documentDateValue = document.documentDate
          ? new Date(document.documentDate)
          : document.createdAt
            ? new Date(document.createdAt)
            : null;
        const dateFromValue = appliedDateRange.dateFrom
          ? new Date(appliedDateRange.dateFrom)
          : null;
        const dateToValue = appliedDateRange.dateTo ? new Date(appliedDateRange.dateTo) : null;

        if (dateFromValue && (!documentDateValue || documentDateValue < dateFromValue)) {
          return false;
        }

        if (dateToValue) {
          const inclusiveDateTo = new Date(dateToValue);
          inclusiveDateTo.setHours(23, 59, 59, 999);

          if (!documentDateValue || documentDateValue > inclusiveDateTo) {
            return false;
          }
        }

        return true;
      }),
    [appliedDateRange.dateFrom, appliedDateRange.dateTo, documentsQuery.data?.documents],
  );

  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleDocuments = filteredDocuments.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );
  const usingSearch = debouncedSearchText.length > 0;
  const searchResultCount = searchQuery.data?.resultsCount ?? 0;
  const activeResultCount = usingSearch ? searchResultCount : filteredDocuments.length;
  const activePageCount = Math.max(1, Math.ceil(activeResultCount / PAGE_SIZE));
  const activePageIndex = usingSearch ? pageIndex : safePageIndex;
  const selectedTag = (tagsQuery.data?.tags ?? []).find((tag) => tag.id === selectedTagId);
  const activeFilters = [
    ...(selectedTag
      ? [
          {
            key: `tag-${selectedTag.id}`,
            label: selectedTag.name,
            onRemove: () => {
              setSelectedTagId('');
              setPageIndex(0);
            },
          },
        ]
      : []),
    ...(datePreset !== 'any'
      ? [
          {
            key: 'date-range',
            label: getDateFilterLabel({
              preset: datePreset,
              dateFrom: appliedDateRange.dateFrom,
              dateTo: appliedDateRange.dateTo,
            }),
            onRemove: () => {
              setDatePreset('any');
              setCustomDateFrom('');
              setCustomDateTo('');
              setPageIndex(0);
            },
          },
        ]
      : []),
  ];
  const emptyState =
    !documentsQuery.isLoading &&
    !searchQuery.isLoading &&
    (usingSearch ? (searchQuery.data?.results.length ?? 0) === 0 : filteredDocuments.length === 0);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string }>).detail;

      if (!detail?.vaultId || detail.vaultId !== vaultId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [queryClient, vaultId]);

  if (!vaultId) {
    return <Text fontSize="sm" color="status.danger">Invalid vault id.</Text>;
  }

  function clearFilters() {
    setSelectedTagId('');
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setPageIndex(0);
  }

  return (
    <Flex as="section" direction="column" gap="6" pb="8">
      <PageIntro
        title="Documents"
        actions={
          <HStack flexWrap="wrap" gap="3">
            <Link to={`/vaults/${vaultId}/documents/trash`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Deleted documents
            </Link>
            <Link to={`/vaults/${vaultId}/tags`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Tags
            </Link>
            <Link to={`/transfers?vaultId=${vaultId}&locked=true`} style={{ textDecoration: 'none' }}>
              <Flex
                display="inline-flex"
                h="11"
                align="center"
                justify="center"
                gap="2"
                rounded="xl"
                bg="accent.default"
                px="5"
                fontSize="sm"
                fontWeight="semibold"
                color="text.inverse"
              >
                <Upload size={16} />
                Upload
              </Flex>
            </Link>
          </HStack>
        }
      />
      <DocumentSearchControls
        query={searchText}
        onQueryChange={(value) => {
          setSearchText(value);
          setPageIndex(0);
        }}
        searchPlaceholder="Search documents"
        searchAriaLabel="Search documents"
        isFiltersOpen={isFiltersOpen}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCloseFilters={() => setIsFiltersOpen(false)}
        onResetFilters={clearFilters}
        activeFilterCount={activeFilters.length}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        sortBy={sortBy}
        onSortChange={(value) => {
          setSortBy(value);
          setPageIndex(0);
        }}
        sortOptions={sortOptions}
        sortSelectId="vault-documents-sort"
        sortAriaLabel="Sort documents"
        filtersTitle="Filters"
        filtersContent={
          <>
            <Box gap="3">
              <Text
                as="span"
                id="vault-documents-tag-filter-label"
                fontSize="sm"
                fontWeight="semibold"
                color="text.default"
              >
                Tag
              </Text>
              <Select
                value={selectedTagId || '__all__'}
                onValueChange={(value) => {
                  setSelectedTagId(value === '__all__' ? '' : value);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger
                  aria-label="Tag filter"
                  aria-labelledby="vault-documents-tag-filter-label"
                  h="10"
                  rounded="lg"
                  borderColor="border.subtle"
                  bg="surface.default"
                  mt="3"
                >
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

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="surface.default" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="text.default">
                Date
              </Text>

              <DatePresetSelector
                idPrefix="vault-documents-date-filter"
                value={datePreset}
                onValueChange={(value) => {
                  setDatePreset(value);
                  setPageIndex(0);
                }}
                customDateFrom={customDateFrom}
                customDateTo={customDateTo}
                onCustomDateFromChange={(nextValue) => {
                  setCustomDateFrom(nextValue);

                  if (customDateTo && nextValue && nextValue > customDateTo) {
                    setCustomDateTo(nextValue);
                  }

                  setPageIndex(0);
                }}
                onCustomDateToChange={(nextValue) => {
                  setCustomDateTo(nextValue);

                  if (customDateFrom && nextValue && nextValue < customDateFrom) {
                    setCustomDateFrom(nextValue);
                  }

                  setPageIndex(0);
                }}
              />
            </Box>
          </>
        }
      />

      <SurfacePanel>
        <Text fontSize="sm" color="text.muted">
          {activeResultCount} document{activeResultCount === 1 ? '' : 's'}
        </Text>
      </SurfacePanel>

      <SurfacePanel overflow="hidden" p="0">
        <DocumentLibraryHeader />

        {documentsQuery.isLoading ? (
          <Text px="6" py="6" fontSize="sm" color="text.muted">Loading documents...</Text>
        ) : null}
        {documentsQuery.isError ? (
          <Text px="6" py="6" fontSize="sm" color="status.danger">Unable to load documents.</Text>
        ) : null}
        {searchQuery.isLoading ? (
          <Text px="6" py="6" fontSize="sm" color="text.muted">Searching documents...</Text>
        ) : null}
        {searchQuery.isError ? (
          <Text px="6" py="6" fontSize="sm" color="status.danger">Unable to search this vault.</Text>
        ) : null}

        {emptyState ? (
          <Text px="6" py="8" fontSize="sm" color="text.muted">
            No documents match the current filters.
          </Text>
        ) : (
          <Flex direction="column" divideY="1px" divideColor="border.subtle">
            {usingSearch
              ? (searchQuery.data?.results ?? []).map((result) => (
                  <DocumentLibraryRow
                    key={result.documentId}
                    name={result.name}
                    mimeType={result.mimeType}
                    originalName={result.originalName}
                    originalSize={result.originalSize}
                    createdAt={result.createdAt}
                    updatedAt={result.updatedAt}
                    tags={result.tags}
                    snippet={
                      result.bestChunk
                        ? tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                            part.highlighted ? (
                              <Box
                                as="mark"
                                key={`${result.documentId}-${part.key}`}
                                rounded="md"
                                bg="accent.subtle"
                                color="text.default"
                                px="1.5"
                                py="0.5"
                              >
                                {part.text}
                              </Box>
                            ) : (
                              <Text as="span" key={`${result.documentId}-${part.key}`}>
                                {part.text}
                              </Text>
                            ),
                          )
                        : undefined
                    }
                    vaultId={vaultId}
                    documentId={result.documentId}
                    deleteDisabled={deleteMutation.isPending}
                    onDelete={() => {
                      deleteMutation.mutate({ vaultId, documentId: result.documentId });
                    }}
                  />
                ))
              : visibleDocuments.map((document) => (
                  <DocumentLibraryRow
                    key={document.id}
                    name={document.name}
                    mimeType={document.mimeType}
                    originalName={document.originalName}
                    originalSize={document.originalSize}
                    createdAt={document.createdAt}
                    updatedAt={document.updatedAt}
                    vaultId={vaultId}
                    documentId={document.id}
                    deleteDisabled={deleteMutation.isPending}
                    onDelete={() => {
                      deleteMutation.mutate({ vaultId, documentId: document.id });
                    }}
                  />
                ))}
          </Flex>
        )}

        <Separator />
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          gap="3"
          px="6"
          py="4"
          alignItems={{ sm: 'center' }}
          justifyContent={{ sm: 'space-between' }}
        >
          <Text fontSize="sm" color="text.muted">
            Page {activePageIndex + 1} of {activePageCount}
          </Text>
          <Flex gap="2">
            <Button
              type="button"
              variant="outline"
              disabled={activePageIndex === 0}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={activePageIndex >= activePageCount - 1}
              onClick={() => setPageIndex((current) => Math.min(activePageCount - 1, current + 1))}
            >
              Next
            </Button>
          </Flex>
        </Flex>
      </SurfacePanel>
    </Flex>
  );
}

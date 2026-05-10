import type { FormEvent } from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActionBar, Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, HStack, Portal, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { File, Folder, FolderPlus, Grid3X3, Home, List, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import {
  EmptyState,
  PageIntro,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDocumentDownloadUrl, softDeleteDocument } from '@/features/documents/documents.api';
import { formatBytes } from '@/features/documents/documents.utils';
import {
  DocumentLibraryTable,
  getDocumentSelectionKey,
} from '@/features/documents/components/document-library-list';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentSearchControls,
} from '@/features/documents/components/document-search-controls';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import type { DocumentSummary } from '@/features/documents/documents.types';
import { createFolder } from '@/features/file-browser/file-browser.api';
import { fileBrowserQueryKeys, useFolderItemsQuery } from '@/features/file-browser/file-browser.queries';
import type { FolderSummary } from '@/features/file-browser/file-browser.types';
import { searchQueryKeys, useVaultSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 8;
const FILE_BROWSER_VIEW_STORAGE_KEY = 'arkivra:file-browser:view';
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
];

type FileBrowserView = 'list' | 'grid';
interface BrowserDocumentItem {
  type: 'document';
  document: DocumentSummary;
}
interface BrowserFolderItem {
  type: 'folder';
  folder: FolderSummary;
}
type BrowserItem = BrowserFolderItem | BrowserDocumentItem;

function getInitialBrowserView(): FileBrowserView {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return 'list';
  }

  try {
    return window.localStorage.getItem(FILE_BROWSER_VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function getDocumentTypeLabel({ name, mimeType }: { name: string; mimeType: string }) {
  const extension = name.split('.').pop()?.trim().toUpperCase();

  if (extension && extension.length <= 5) {
    return extension;
  }

  if (mimeType === 'application/pdf') {
    return 'PDF';
  }

  if (mimeType.startsWith('image/')) {
    return 'IMG';
  }

  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return 'XLS';
  }

  if (mimeType.includes('word') || mimeType.includes('document')) {
    return 'DOC';
  }

  if (mimeType.startsWith('text/')) {
    return 'TXT';
  }

  return 'FILE';
}

function getItemName(item: BrowserItem) {
  return item.type === 'folder' ? item.folder.name : item.document.name;
}

function FileBrowserIcon({ item }: { item: BrowserItem }) {
  if (item.type === 'folder') {
    return (
      <Flex boxSize="10" shrink={0} align="center" justify="center" rounded="lg" bg="teal.subtle" color="teal.fg">
        <Folder size={20} />
      </Flex>
    );
  }

  const label = getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType });

  return (
    <Flex boxSize="10" shrink={0} align="center" justify="center" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" color="fg">
      <Stack align="center" gap="0" lineHeight="none">
        <File size={14} />
        <Text as="span" fontSize="0.58rem" fontWeight="bold" letterSpacing="normal">
          {label}
        </Text>
      </Stack>
    </Flex>
  );
}

function FolderBreadcrumbs({
  currentFolderId,
  breadcrumbs,
  onNavigateFolder,
}: {
  currentFolderId: string | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  onNavigateFolder: (folderId: string | null) => void;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {currentFolderId === null ? (
            <BreadcrumbPage display="inline-flex" alignItems="center" gap="1.5">
              <Home size={14} />
              Root
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              as="button"
              type="button"
              display="inline-flex"
              alignItems="center"
              gap="1.5"
              onClick={() => onNavigateFolder(null)}
            >
              <Home size={14} />
              Root
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {breadcrumbs.map((folder, index) => {
          const isCurrent = index === breadcrumbs.length - 1;
          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isCurrent ? (
                  <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink as="button" type="button" onClick={() => onNavigateFolder(folder.id)}>
                    {folder.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function DocumentItemActions({
  document,
  onDeleteDocument,
  disabled,
}: {
  document: DocumentSummary;
  onDeleteDocument: (document: DocumentSummary) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionMenuTriggerButton
          label={`Open actions for ${document.name}`}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW="48">
        <DropdownMenuItem
          value="move-to-trash"
          color="fg.error"
          onClick={(event) => event.stopPropagation()}
          onSelect={() => onDeleteDocument(document)}
        >
          <ActionMenuItemIcon icon={Trash2} tone="destructive" />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrowserItemList({
  items,
  vaultId,
  onOpenFolder,
  onDeleteDocument,
  isDeleting,
}: {
  items: BrowserItem[];
  vaultId: string;
  onOpenFolder: (folderId: string) => void;
  onDeleteDocument: (document: DocumentSummary) => void;
  isDeleting?: boolean;
}) {
  return (
    <SurfacePanel overflow="hidden" p="0">
      <Grid
        display={{ base: 'none', md: 'grid' }}
        templateColumns="minmax(0, 1.4fr) 140px 132px 44px"
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        px="6"
        py="3"
        fontSize="sm"
        color="fg.muted"
      >
        <Text as="span">Name</Text>
        <Text as="span">Updated</Text>
        <Text as="span">Size</Text>
        <Text as="span" srOnly>Actions</Text>
      </Grid>

      {items.map((item) => {
        const name = getItemName(item);
        const updatedAt = item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;

        return (
          <Box key={item.type === 'folder' ? `folder-${item.folder.id}` : `document-${item.document.id}`} borderBottomWidth="1px" borderColor="border.subtle" _last={{ borderBottomWidth: 0 }}>
            {item.type === 'folder' ? (
              <chakra.button
                type="button"
                display="grid"
                w="full"
                gridTemplateColumns={{ base: '1fr', md: 'minmax(0, 1.4fr) 140px 132px 44px' }}
                gap="4"
                alignItems="center"
                px="6"
                py="3.5"
                textAlign="left"
                transition="background-color 0.15s ease"
                _hover={{ bg: 'bg.subtle' }}
                onClick={() => onOpenFolder(item.folder.id)}
              >
                <Flex minW="0" align="center" gap="3">
                  <FileBrowserIcon item={item} />
                  <Box minW="0">
                    <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                    <Text display={{ md: 'none' }} mt="1" textStyle="xs" color="fg.muted">
                      Folder • Updated {formatDateOnly(updatedAt)}
                    </Text>
                  </Box>
                </Flex>
                <Text display={{ base: 'none', md: 'block' }} textStyle="sm">{formatDateOnly(updatedAt)}</Text>
                <Text display={{ base: 'none', md: 'block' }} textStyle="sm" color="fg.muted">Folder</Text>
                <Box display={{ base: 'none', md: 'block' }} />
              </chakra.button>
            ) : (
              <Grid
                templateColumns={{ base: 'minmax(0, 1fr) auto', md: 'minmax(0, 1.4fr) 140px 132px 44px' }}
                gap="4"
                alignItems="center"
                px="6"
                py="3.5"
                transition="background-color 0.15s ease"
                _hover={{ bg: 'bg.subtle' }}
              >
                <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                  <Flex minW="0" align="center" gap="3">
                    <FileBrowserIcon item={item} />
                    <Box minW="0">
                      <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                      {item.document.originalName !== item.document.name ? (
                        <Text mt="1" truncate textStyle="xs" color="fg.muted">
                          {item.document.originalName}
                        </Text>
                      ) : null}
                    </Box>
                  </Flex>
                </Link>
                <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                  <Text display={{ base: 'none', md: 'block' }} textStyle="sm">{formatDateOnly(updatedAt)}</Text>
                </Link>
                <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                  <Text display={{ base: 'none', md: 'block' }} textStyle="sm">{formatBytes(item.document.originalSize)}</Text>
                </Link>
                <DocumentItemActions
                  document={item.document}
                  disabled={isDeleting}
                  onDeleteDocument={onDeleteDocument}
                />
              </Grid>
            )}
          </Box>
        );
      })}
    </SurfacePanel>
  );
}

function BrowserItemGrid({
  items,
  vaultId,
  onOpenFolder,
  onDeleteDocument,
  isDeleting,
}: {
  items: BrowserItem[];
  vaultId: string;
  onOpenFolder: (folderId: string) => void;
  onDeleteDocument: (document: DocumentSummary) => void;
  isDeleting?: boolean;
}) {
  return (
    <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} gap="3">
      {items.map((item) => {
        const name = getItemName(item);
        const key = item.type === 'folder' ? `folder-${item.folder.id}` : `document-${item.document.id}`;
        const body = item.type === 'folder' ? (
          <SurfacePanel h="full" p="4" transition="background-color 0.15s ease, border-color 0.15s ease" _hover={{ bg: 'bg.subtle', borderColor: 'border' }}>
            <Stack minH="8.5rem" justify="space-between" gap="4">
              <Stack gap="3">
                <FileBrowserIcon item={item} />
                <Box minW="0">
                  <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                  <Text mt="1" textStyle="xs" color="fg.muted">
                    Folder
                  </Text>
                </Box>
              </Stack>
              <Text textStyle="xs" color="fg.muted">
                Updated {formatDateOnly(item.folder.updatedAt)}
              </Text>
            </Stack>
          </SurfacePanel>
        ) : (
          <SurfacePanel h="full" p="4" transition="background-color 0.15s ease, border-color 0.15s ease" _hover={{ bg: 'bg.subtle', borderColor: 'border' }}>
            <Stack minH="8.5rem" justify="space-between" gap="4">
              <Stack gap="3">
                <Flex align="flex-start" justify="space-between" gap="3">
                  <FileBrowserIcon item={item} />
                  <DocumentItemActions
                    document={item.document}
                    disabled={isDeleting}
                    onDeleteDocument={onDeleteDocument}
                  />
                </Flex>
                <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Box minW="0">
                    <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                    <Text mt="1" textStyle="xs" color="fg.muted">
                      {`${formatBytes(item.document.originalSize)} • ${getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType })}`}
                    </Text>
                  </Box>
                </Link>
              </Stack>
              <Text textStyle="xs" color="fg.muted">
                Updated {formatDateOnly(item.document.updatedAt)}
              </Text>
            </Stack>
          </SurfacePanel>
        );

        return item.type === 'folder' ? (
          <chakra.button key={key} type="button" textAlign="left" onClick={() => onOpenFolder(item.folder.id)}>
            {body}
          </chakra.button>
        ) : (
          <Box key={key}>{body}</Box>
        );
      })}
    </SimpleGrid>
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
  const params = useParams({ strict: false }) as { vaultId?: string };
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const vaultId = params.vaultId ?? '';
  const currentFolderId = search.folderId ?? null;
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SearchSortBy>('created_desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState<string[]>([]);
  const [browserView, setBrowserView] = useState<FileBrowserView>(getInitialBrowserView);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
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

  const folderItemsQuery = useFolderItemsQuery({
    vaultId,
    folderId: currentFolderId,
    enabled: debouncedSearchText.length === 0,
  });
  const documentsQuery = useDocumentsQuery({
    vaultId,
    tagId: selectedTagId || undefined,
    sortBy,
    folderId: currentFolderId,
    enabled: debouncedSearchText.length === 0,
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
    mutationFn: async (documents: Array<{ vaultId: string; documentId: string }>) =>
      Promise.all(documents.map((document) => softDeleteDocument(document))),
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      const deletedKeys = new Set(
        documents.map((document) => getDocumentSelectionKey(document.vaultId, document.documentId)),
      );
      setSelectedDocumentKeys((current) => current.filter((key) => !deletedKeys.has(key)));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });
  const createFolderMutation = useMutation({
    mutationFn: () => createFolder({
      vaultId,
      parentId: currentFolderId,
      name: folderName,
    }),
    onSuccess: async () => {
      toast.success('Folder created.');
      setFolderName('');
      setIsCreateFolderOpen(false);
      await queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create folder.');
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
  const folderItems = useMemo(
    () => folderItemsQuery.data?.folders ?? [],
    [folderItemsQuery.data?.folders],
  );
  const browserItems = useMemo<BrowserItem[]>(
    () => [
      ...folderItems.map(folder => ({ type: 'folder' as const, folder })),
      ...visibleDocuments.map(document => ({ type: 'document' as const, document })),
    ].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1;
      }

      return getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
    }),
    [folderItems, visibleDocuments],
  );
  const searchResultCount = searchQuery.data?.resultsCount ?? 0;
  const activeResultCount = usingSearch ? searchResultCount : filteredDocuments.length + folderItems.length;
  const activePageCount = Math.max(1, Math.ceil((usingSearch ? searchResultCount : filteredDocuments.length) / PAGE_SIZE));
  const activePageIndex = usingSearch ? pageIndex : safePageIndex;
  const activeIsLoading = usingSearch
    ? searchQuery.isLoading
    : documentsQuery.isLoading || folderItemsQuery.isLoading;
  const activeIsError = usingSearch
    ? searchQuery.isError
    : documentsQuery.isError || folderItemsQuery.isError;
  const activeDocuments = useMemo(
    () => (
      usingSearch
        ? (searchQuery.data?.results ?? []).map((result) => ({
            documentId: result.documentId,
            vaultId,
            name: result.name,
            mimeType: result.mimeType,
            originalName: result.originalName,
            originalSize: result.originalSize,
            createdAt: result.createdAt,
            updatedAt: result.updatedAt,
            tags: result.tags,
            snippet: result.bestChunk
              ? tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                  part.highlighted ? (
                    <Box
                      as="mark"
                      key={`${result.documentId}-${part.key}`}
                      rounded="md"
                      bg="teal.subtle"
                      color="fg"
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
              : undefined,
          }))
        : visibleDocuments.map((document) => ({
            documentId: document.id,
            vaultId,
            name: document.name,
            mimeType: document.mimeType,
            originalName: document.originalName,
            originalSize: document.originalSize,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
          }))
    ),
    [searchQuery.data?.results, usingSearch, vaultId, visibleDocuments],
  );
  const selectedDocuments = useMemo(() => {
    const documentsByKey = new Map(
      activeDocuments.map((document) => [
        getDocumentSelectionKey(document.vaultId, document.documentId),
        document,
      ]),
    );

    return selectedDocumentKeys
      .map((key) => documentsByKey.get(key))
      .filter((document): document is (typeof activeDocuments)[number] => Boolean(document));
  }, [activeDocuments, selectedDocumentKeys]);
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
    !activeIsLoading &&
    !activeIsError &&
    (usingSearch ? (searchQuery.data?.results.length ?? 0) === 0 : browserItems.length === 0);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string }>).detail;

      if (!detail?.vaultId || detail.vaultId !== vaultId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      ]);
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [queryClient, vaultId]);

  useEffect(() => {
    try {
      window.localStorage?.setItem?.(FILE_BROWSER_VIEW_STORAGE_KEY, browserView);
    } catch {
    }
  }, [browserView]);

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  function clearFilters() {
    setSelectedTagId('');
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setPageIndex(0);
  }

  function toggleDocumentSelection(selectionKey: string, checked: boolean) {
    setSelectedDocumentKeys((current) => (
      checked
        ? current.includes(selectionKey) ? current : [...current, selectionKey]
        : current.filter((key) => key !== selectionKey)
    ));
  }

  function toggleAllDocumentSelection(selectionKeys: string[], checked: boolean) {
    setSelectedDocumentKeys((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...selectionKeys]));
      }

      const selectionSet = new Set(selectionKeys);
      return current.filter((key) => !selectionSet.has(key));
    });
  }

  function downloadDocuments(documents: Array<{ vaultId: string; documentId: string }>) {
    for (const document of documents) {
      const link = window.document.createElement('a');
      link.href = getDocumentDownloadUrl(document);
      link.download = '';
      link.rel = 'noopener';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  function navigateToFolder(folderId: string | null) {
    setPageIndex(0);
    setSelectedDocumentKeys([]);
    void navigate({
      to: ROUTES.vaultRoot(vaultId),
      search: folderId === null ? {} : { folderId },
      replace: false,
    } as any);
  }

  function deleteDocument(document: DocumentSummary) {
    deleteMutation.mutate([{ vaultId, documentId: document.id }]);
  }

  function handleCreateFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folderName.trim().length === 0) {
      return;
    }

    createFolderMutation.mutate();
  }

  return (
    <Flex as="section" direction="column" gap="6" pb="8">
      <PageIntro
        title="Documents"
        actions={
          <HStack flexWrap="wrap" gap="3">
            <Link to={ROUTES.vaultTrash(vaultId)} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Deleted documents
            </Link>
            <Link to={ROUTES.vaultTags(vaultId)} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Tags
            </Link>
            <Button type="button" variant="outline" onClick={() => setIsCreateFolderOpen(true)}>
              <FolderPlus size={16} />
              New folder
            </Button>
            <Link to={ROUTES.transfersWithLock(vaultId, currentFolderId)} style={{ textDecoration: 'none' }}>
              <Flex
                display="inline-flex"
                h="11"
                align="center"
                justify="center"
                gap="2"
                rounded="xl"
                bg="teal.solid"
                px="5"
                fontSize="sm"
                fontWeight="semibold"
                color="fg.inverted"
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
                color="fg"
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
                  bg="bg.surface"
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

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="fg">
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

      <SurfacePanel display="flex" flexDirection={{ base: 'column', lg: 'row' }} alignItems={{ lg: 'center' }} justifyContent="space-between" gap="3">
        <Stack gap="2" minW="0">
          <FolderBreadcrumbs
            currentFolderId={currentFolderId}
            breadcrumbs={folderItemsQuery.data?.breadcrumbs ?? []}
            onNavigateFolder={navigateToFolder}
          />
          <Text fontSize="sm" color="fg.muted">
            {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
          </Text>
        </Stack>
        <Flex align="center" gap="2">
          <Button
            type="button"
            size="sm"
            variant={browserView === 'list' ? 'solid' : 'outline'}
            aria-label="List view"
            onClick={() => setBrowserView('list')}
          >
            <List size={16} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={browserView === 'grid' ? 'solid' : 'outline'}
            aria-label="Grid view"
            onClick={() => setBrowserView('grid')}
          >
            <Grid3X3 size={16} />
          </Button>
        </Flex>
      </SurfacePanel>

      {activeIsLoading ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.muted">
            {usingSearch ? 'Searching documents...' : 'Loading folder...'}
          </Text>
        </SurfacePanel>
      ) : null}
      {activeIsError ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.error">
            {usingSearch ? 'Unable to search this vault.' : 'Unable to load this folder.'}
          </Text>
        </SurfacePanel>
      ) : null}

      {!activeIsLoading && emptyState ? (
        <EmptyState
          icon={<Folder size={24} />}
          title={usingSearch ? 'No matches' : 'This folder is empty'}
          description={usingSearch ? 'No documents match the current filters.' : 'Create a folder or upload documents here.'}
          action={!usingSearch ? (
            <Button type="button" variant="outline" onClick={() => setIsCreateFolderOpen(true)}>
              <FolderPlus size={16} />
              New folder
            </Button>
          ) : undefined}
        />
      ) : null}

      {!activeIsLoading && !activeIsError && !emptyState ? (
        usingSearch ? (
          <SurfacePanel overflow="hidden" p="0">
          <DocumentLibraryTable
            vaultName="Current vault"
            documents={activeDocuments}
            selectedDocumentKeys={selectedDocumentKeys}
            onToggleDocument={toggleDocumentSelection}
            onToggleAllDocuments={toggleAllDocumentSelection}
          />
          </SurfacePanel>
        ) : browserView === 'list' ? (
          <BrowserItemList
            items={browserItems}
            vaultId={vaultId}
            onOpenFolder={navigateToFolder}
            onDeleteDocument={deleteDocument}
            isDeleting={deleteMutation.isPending}
          />
        ) : (
          <BrowserItemGrid
            items={browserItems}
            vaultId={vaultId}
            onOpenFolder={navigateToFolder}
            onDeleteDocument={deleteDocument}
            isDeleting={deleteMutation.isPending}
          />
        )
      ) : null}

      <SurfacePanel display="flex" flexDirection={{ base: 'column', sm: 'row' }} gap="2" alignItems={{ sm: 'center' }} justifyContent={{ sm: 'space-between' }} p="3">
        <Text fontSize="xs" color="fg.muted">
          Page {activePageIndex + 1} of {activePageCount}
        </Text>
        <Flex gap="2">
          <Button
            size="xs"
            type="button"
            variant="outline"
            disabled={activePageIndex === 0}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            Previous
          </Button>
          <Button
            size="xs"
            type="button"
            variant="outline"
            disabled={activePageIndex >= activePageCount - 1}
            onClick={() => setPageIndex((current) => Math.min(activePageCount - 1, current + 1))}
          >
            Next
          </Button>
        </Flex>
      </SurfacePanel>

      <ChakraDialog.Root
        open={isCreateFolderOpen}
        onOpenChange={(event) => {
          setIsCreateFolderOpen(event.open);
          if (!event.open) {
            setFolderName('');
          }
        }}
        size={{ mdDown: 'full', md: 'md' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <form onSubmit={handleCreateFolderSubmit}>
                <ChakraDialog.Header>
                  <ChakraDialog.Title>New folder</ChakraDialog.Title>
                  <ChakraDialog.CloseTrigger asChild>
                    <CloseButton size="sm" />
                  </ChakraDialog.CloseTrigger>
                </ChakraDialog.Header>
                <ChakraDialog.Body>
                  <Stack gap="2">
                    <chakra.label htmlFor="folder-name" fontSize="sm" fontWeight="medium" color="fg">
                      Name
                    </chakra.label>
                    <Input
                      id="folder-name"
                      value={folderName}
                      onChange={(event) => setFolderName(event.target.value)}
                      autoFocus
                    />
                  </Stack>
                </ChakraDialog.Body>
                <ChakraDialog.Footer>
                  <ChakraDialog.ActionTrigger asChild>
                    <Button type="button" variant="outline" disabled={createFolderMutation.isPending}>
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  <Button type="submit" disabled={folderName.trim().length === 0 || createFolderMutation.isPending}>
                    {createFolderMutation.isPending ? 'Creating...' : 'Create folder'}
                  </Button>
                </ChakraDialog.Footer>
              </form>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <ActionBar.Root open={selectedDocuments.length > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>
                {selectedDocuments.length} selected
              </ActionBar.SelectionTrigger>
              <ActionBar.Separator />
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  downloadDocuments(
                    selectedDocuments.map((document) => ({
                      vaultId: document.vaultId,
                      documentId: document.documentId,
                    })),
                  );
                }}
              >
                Download selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate(
                    selectedDocuments.map((document) => ({
                      vaultId: document.vaultId,
                      documentId: document.documentId,
                    })),
                  );
                }}
              >
                Delete selected
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Flex>
  );
}

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Flex,
  Text,
  CloseButton,
  Dialog as ChakraDialog,
  Portal,
  chakra,
  IconButton,
} from '@chakra-ui/react';
import {
  Check,
  History,
  Image as ImageIcon,
  MessageSquare,
  ScanText,
  Tags,
  Plus,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import type { SearchRouteSearch, VaultWorkspaceSearch } from '@/app/search-params';
import { validateVaultWorkspaceSearch } from '@/app/search-params';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { DeleteButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';
import { adminQueryKeys } from '@/features/admin/admin.queries';
import { chatQueryKeys } from '@/features/chat/chat.queries';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DocumentActionMenu } from '@/features/documents/components/detail/document-action-menu';
import { DocumentContentSection } from '@/features/documents/components/detail/document-content-section';
import type { DocumentContentTab } from '@/features/documents/components/detail/document-content-section';
import { DocumentMetadataSection } from '@/features/documents/components/detail/document-metadata-section';
import { DocumentPreviewSection } from '@/features/documents/components/detail/document-preview-section';
import type { DocumentPreviewKind } from '@/features/documents/components/detail/document-preview-section';
import { DocumentViewHeader } from '@/features/documents/components/detail/document-view-header';
import {
  deleteDocumentVersion,
  getDocumentInlineFileUrl,
  getDocumentVersionDownloadUrl,
  renameDocument,
  restoreDocument,
  restoreDocumentVersion,
  softDeleteDocument,
  updateDocumentLanguage,
} from '@/features/documents/documents.api';
import type { DocumentLanguageMetadata, DocumentVersionSummary } from '@/features/documents/documents.types';
import {
  documentQueryKeys,
  useDeletedDocumentsQuery,
  useDocumentChunksQuery,
  useDocumentFileTextQuery,
  useDocumentQuery,
  useDocumentTagsQuery,
  useDocumentVersionChunksQuery,
  useDocumentVersionQuery,
  useDocumentVersionsQuery,
} from '@/features/documents/documents.queries';
import {
  getDocumentProcessingStageDescription,
  getDocumentProcessingStageLabel,
  isDocumentProcessingActive,
} from '@/features/documents/documents.utils';
import { assignTagToDocument, createTag, removeTagFromDocument } from '@/features/tags/tags.api';
import { TagBadge } from '@/features/tags/components/tag-badge';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';
import { DocumentActivityPanel } from '@/features/audit/components/document-activity-panel';
import { DocumentVersionsDialog } from '@/features/documents/components/detail/document-versions-dialog';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { canUseVaultChat } from '@/features/vaults/vault-permissions';
import { useVaultQuery } from '@/features/vaults/vaults.queries';

type PreviewKind = DocumentPreviewKind;
export type DocumentSection = 'preview' | 'content' | 'metadata' | 'activity';

const searchReturnParamKeys = [
  'q',
  'vaultId',
  'vaultIds',
  'tagId',
  'tagIds',
  'dateFrom',
  'dateTo',
  'sortBy',
  'searchMode',
] as const;
const documentFileExtensionPattern = /\.[^/.]+$/;
const browserImagePreviewExtensions = new Set(['gif', 'jpeg', 'jpg', 'png', 'webp']);

function getDocumentLanguageLabel(language: DocumentLanguageMetadata | null | undefined) {
  if (language === null || language === undefined) {
    return 'Unknown';
  }

  return language.name || language.code.toUpperCase();
}

function getDocumentTitle(name: string) {
  return name.replace(documentFileExtensionPattern, '');
}

function getDocumentFileTypeLabel(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return 'PDF document';
  }

  if (mimeType.startsWith('image/')) {
    return 'Image file';
  }

  if (mimeType.startsWith('text/')) {
    return 'Text document';
  }

  return 'Document';
}

function getSearchReturnParams(search: VaultWorkspaceSearch): SearchRouteSearch | null {
  if (search.source !== 'search') {
    return null;
  }

  const params: SearchRouteSearch = {};

  for (const key of searchReturnParamKeys) {
    const value = search[key];
    if (typeof value === 'string' && value.length > 0) {
      Object.assign(params, { [key]: value });
    }
  }

  return params;
}

function isMarkdownDocument({
  mimeType,
  name,
  originalName,
}: {
  mimeType: string;
  name: string;
  originalName: string;
}) {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedNames = [name, originalName].map((value) => value.toLowerCase());

  return (
    normalizedMimeType === 'text/markdown' ||
    normalizedMimeType === 'text/x-markdown' ||
    normalizedMimeType === 'application/markdown' ||
    normalizedMimeType === 'application/x-markdown' ||
    normalizedNames.some(
      (normalizedName) =>
        normalizedName.endsWith('.md') ||
        normalizedName.endsWith('.markdown') ||
        normalizedName.endsWith('.mdown') ||
        normalizedName.endsWith('.mkd'),
    )
  );
}

function getDocumentFileExtension(name: string) {
  const extension = name.split('.').pop()?.trim().toLowerCase();
  return extension && extension !== name.trim().toLowerCase() ? extension : '';
}

function isImageDocument({
  mimeType,
  name,
  originalName,
}: {
  mimeType: string;
  name: string;
  originalName: string;
}) {
  if (mimeType.toLowerCase().startsWith('image/')) {
    return true;
  }

  return [name, originalName].some((value) =>
    browserImagePreviewExtensions.has(getDocumentFileExtension(value)),
  );
}

function getPreviewKind(mimeType: string, name: string, originalName: string): PreviewKind {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (isImageDocument({ mimeType, name, originalName })) {
    return 'image';
  }

  if (isMarkdownDocument({ mimeType, name, originalName })) {
    return 'markdown';
  }

  if (mimeType.startsWith('text/')) {
    return 'text';
  }

  return 'unsupported';
}

export function DocumentDetailPage({ section = 'preview' }: { section?: DocumentSection }) {
  const params = useParams({ strict: false }) as { vaultId?: string; documentId?: string };
  const documentId = params.documentId ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const { showExtractedTextTab } = useAccentColor();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const isTrashDocumentRoute = pathParts[0] === 'trash';
  const deletedDocumentsQuery = useDeletedDocumentsQuery({ enabled: isTrashDocumentRoute });
  const trashDocumentSummary = useMemo(
    () =>
      deletedDocumentsQuery.data?.documents.find((document) => document.id === documentId) ?? null,
    [deletedDocumentsQuery.data?.documents, documentId],
  );
  const vaultId = params.vaultId ?? trashDocumentSummary?.vaultId ?? '';
  const parentRoute = isTrashDocumentRoute ? ROUTES.trash : ROUTES.vaultRoot(vaultId);

  const documentQuery = useDocumentQuery({ vaultId, documentId });
  const documentTagsQuery = useDocumentTagsQuery({ vaultId, documentId });
  const tagsQuery = useTagsQuery();
  const vaultQuery = useVaultQuery({ vaultId });
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;
  const folderTreeQuery = useFolderTreeQuery({ vaultId, enabled: vaultId.length > 0 });
  const previewKind = getPreviewKind(
    documentQuery.data?.document.mimeType ?? '',
    documentQuery.data?.document.name ?? '',
    documentQuery.data?.document.originalName ?? '',
  );
  const markdownSourceQuery = useDocumentFileTextQuery({
    vaultId,
    documentId,
    includeDeleted: isTrashDocumentRoute,
    enabled:
      previewKind === 'markdown' &&
      (documentQuery.data?.document.isDeleted === false || isTrashDocumentRoute),
  });

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [languageValue, setLanguageValue] = useState<string | null>(null);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [isLanguageEditing, setIsLanguageEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isVersionsDialogOpen, setIsVersionsDialogOpen] = useState(false);
  const documentVersionSelectionKey = `${vaultId}:${documentId}`;
  const [selectedVersionState, setSelectedVersionState] = useState<{
    key: string;
    versionId: string | null;
  }>({ key: documentVersionSelectionKey, versionId: null });
  const selectedVersionId = selectedVersionState.key === documentVersionSelectionKey
    ? selectedVersionState.versionId
    : null;
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagSearchValue, setTagSearchValue] = useState('');

  useDialogPageLockCleanup(isDeleteDialogOpen);
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
  const [createTagNameValue, setCreateTagNameValue] = useState('');
  const [createTagColorValue, setCreateTagColorValue] = useState('#D8FF75');
  const [createTagDescriptionValue, setCreateTagDescriptionValue] = useState('');
  const [documentContentTab, setDocumentContentTab] = useState<DocumentContentTab>('text');
  const canShowExtractedTextTab = showExtractedTextTab && !isTrashDocumentRoute;
  const detailActiveSection =
    section === 'content' && !canShowExtractedTextTab ? 'preview' : section;
  const documentVersionsQuery = useDocumentVersionsQuery({
    vaultId,
    documentId,
    enabled: !isTrashDocumentRoute,
  });
  const selectedDocumentVersionQuery = useDocumentVersionQuery({
    vaultId,
    documentId,
    versionId: selectedVersionId ?? '',
    enabled: selectedVersionId !== null && !isTrashDocumentRoute,
  });
  const documentChunksQuery = useDocumentChunksQuery({
    vaultId,
    documentId,
    enabled:
      selectedVersionId === null &&
      detailActiveSection === 'content' &&
      documentContentTab === 'chunks' &&
      !isTrashDocumentRoute,
  });
  const documentVersionChunksQuery = useDocumentVersionChunksQuery({
    vaultId,
    documentId,
    versionId: selectedVersionId ?? '',
    enabled:
      selectedVersionId !== null &&
      detailActiveSection === 'content' &&
      documentContentTab === 'chunks' &&
      !isTrashDocumentRoute,
  });

  const documentBreadcrumbFolders = useMemo(() => {
    const folderId = documentQuery.data?.document.folderId;
    const folders = folderTreeQuery.data?.folders ?? [];

    if (!folderId) {
      return [];
    }

    const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
    const path: typeof folders = [];
    let current = foldersById.get(folderId);

    while (current) {
      path.unshift(current);
      current = current.parentId ? foldersById.get(current.parentId) : undefined;
    }

    return path;
  }, [documentQuery.data?.document.folderId, folderTreeQuery.data?.folders]);
  const routeSearch = useMemo(
    () => validateVaultWorkspaceSearch(location.search),
    [location.search],
  );
  const searchReturnParams = useMemo(() => getSearchReturnParams(routeSearch), [routeSearch]);

  const documentBreadcrumbEntries = useMemo<VaultBreadcrumbEntry[]>(() => {
    if (isTrashDocumentRoute) {
      return [
        {
          key: 'trash',
          label: 'Trash',
          onClick: () => navigate({ to: ROUTES.trash }),
        },
        {
          key: `document-${documentId}`,
          label: documentQuery.data?.document.name ?? trashDocumentSummary?.name ?? 'Document',
        },
      ];
    }

    return [
      ...(searchReturnParams
        ? [
            {
              key: 'search-results',
              label: 'Search results',
              onClick: () => navigate({ to: ROUTES.search, search: searchReturnParams }),
            },
          ]
        : [{ key: 'vaults', label: 'Vaults', to: ROUTES.vaults }]),
      {
        key: `vault-${vaultId}`,
        label: vaultQuery.data?.vault.name ?? 'Vault',
        onClick: () => navigate({ to: ROUTES.vaultRoot(vaultId) }),
      },
      ...documentBreadcrumbFolders.map((folder) => ({
        key: `folder-${folder.id}`,
        label: folder.name,
        onClick: () =>
          navigate({
            to: ROUTES.vaultRoot(vaultId),
            search: { folderId: folder.id },
          }),
      })),
      {
        key: `document-${documentId}`,
        label: documentQuery.data?.document.name ?? 'Document',
      },
    ];
  }, [
    documentBreadcrumbFolders,
    documentId,
    documentQuery.data?.document.name,
    isTrashDocumentRoute,
    navigate,
    searchReturnParams,
    trashDocumentSummary?.name,
    vaultId,
    vaultQuery.data?.vault.name,
  ]);

  const documentWorkspaceHeader = useMemo(
    () => ({
      left: <VaultRouteBreadcrumbs entries={documentBreadcrumbEntries} showFullLastLabel />,
    }),
    [documentBreadcrumbEntries],
  );
  useWorkspaceHeader(documentWorkspaceHeader);

  function closeDocumentDetail() {
    if (searchReturnParams) {
      navigate({ to: ROUTES.search, search: searchReturnParams });
      return;
    }

    navigate({ to: parentRoute });
  }

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string; documentId?: string }>).detail;

      if (detail?.vaultId !== vaultId || detail?.documentId !== documentId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(vaultId, documentId),
      });
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [documentId, queryClient, vaultId]);

  const invalidateDocument = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: tagQueryKeys.list() }),
    ]);
  };

  const invalidateDocumentTags = async () => {
    await queryClient.invalidateQueries({
      queryKey: documentQueryKeys.tags(vaultId, documentId),
    });
    await queryClient.invalidateQueries({
      queryKey: [...documentQueryKeys.all, 'list', vaultId],
    });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list() });
  };

  const renameMutation = useMutation({
    mutationFn: renameDocument,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename document.');
    },
  });

  const languageMutation = useMutation({
    mutationFn: updateDocumentLanguage,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update document language.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      setIsDeleteDialogOpen(false);
      await invalidateDocument();
      navigate({ to: parentRoute, replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      toast.success('Document restored.');
      await invalidateDocument();
      if (isTrashDocumentRoute) {
        navigate({ to: ROUTES.trash, replace: true });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore document.');
    },
  });

  const restoreVersionMutation = useMutation({
    mutationFn: restoreDocumentVersion,
    onSuccess: async () => {
      toast.success('Version restored as latest.');
      setSelectedVersionState({ key: documentVersionSelectionKey, versionId: null });
      await invalidateDocument();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore version.');
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: deleteDocumentVersion,
    onSuccess: async (_result, variables) => {
      toast.success('Version deleted.');
      if (selectedVersionId === variables.versionId) {
        setSelectedVersionState({ key: documentVersionSelectionKey, versionId: null });
      }
      await invalidateDocument();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete version.');
    },
  });

  const assignTagMutation = useMutation({
    mutationFn: assignTagToDocument,
    onSuccess: async () => {
      await invalidateDocumentTags();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not assign tag.');
    },
  });

  const createTagMutation = useMutation({
    mutationFn: createTag,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create tag.');
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: removeTagFromDocument,
    onSuccess: async () => {
      await invalidateDocumentTags();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove tag.');
    },
  });

  if (!vaultId || !documentId) {
    if (isTrashDocumentRoute && deletedDocumentsQuery.isLoading) {
      return (
        <Text fontSize="sm" color="fg.muted">
          Loading document...
        </Text>
      );
    }

    return (
      <Text fontSize="sm" color="fg.error">
        Invalid document route.
      </Text>
    );
  }

  if (documentQuery.isLoading || (isTrashDocumentRoute && deletedDocumentsQuery.isLoading)) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Loading document...
      </Text>
    );
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <Text fontSize="sm" color="fg.error">
        Unable to load document.
      </Text>
    );
  }

  const document = documentQuery.data.document;
  const selectedVersionSummary = selectedVersionId === null
    ? null
    : documentVersionsQuery.data?.versions.find((version) => version.id === selectedVersionId) ?? null;
  const selectedVersionDetail = selectedDocumentVersionQuery.data?.version ?? null;
  const selectedVersion = selectedVersionDetail ?? selectedVersionSummary;
  const isHistoricalVersionSelected = selectedVersionId !== null;
  const activeDocument = isHistoricalVersionSelected && selectedVersionDetail !== null
    ? {
        ...document,
        originalName: selectedVersionDetail.originalName,
        originalSize: selectedVersionDetail.originalSize,
        originalSha256Hash: selectedVersionDetail.originalSha256Hash,
        mimeType: selectedVersionDetail.mimeType,
        processingStatus: selectedVersionDetail.processingStatus,
        language: selectedVersionDetail.language,
        content: selectedVersionDetail.content,
        displayContent: selectedVersionDetail.rawMarkdown || selectedVersionDetail.content,
        updatedAt: selectedVersionDetail.updatedAt,
        isDeleted: document.isDeleted || selectedVersionDetail.deletedAt !== null,
        deletedAt: document.deletedAt ?? selectedVersionDetail.deletedAt,
      }
    : document;
  const activePreviewKind = getPreviewKind(
    activeDocument.mimeType,
    activeDocument.name,
    activeDocument.originalName,
  );
  const assignedTags = documentTagsQuery.data?.tags ?? [];
  const availableTags = (tagsQuery.data?.tags ?? []).filter(
    (tag) => !assignedTags.some((assigned) => assigned.id === tag.id),
  );
  const normalizedTagSearchValue = tagSearchValue.trim().toLowerCase();
  const filteredAvailableTags = availableTags.filter((tag) => {
    if (normalizedTagSearchValue.length === 0) {
      return true;
    }

    return tag.name.toLowerCase().includes(normalizedTagSearchValue);
  });
  const sortedFilteredAvailableTags = [...filteredAvailableTags].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedMatchingTags = [...assignedTags]
    .filter((tag) => {
      if (normalizedTagSearchValue.length === 0) {
        return true;
      }

      return tag.name.toLowerCase().includes(normalizedTagSearchValue);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasExactTagMatch = availableTags.some(
    (tag) => tag.name.trim().toLowerCase() === normalizedTagSearchValue,
  );
  const inlineFileUrl = getDocumentInlineFileUrl({
    vaultId,
    documentId,
    includeDeleted: isTrashDocumentRoute,
  });
  const historicalDownloadUrl = selectedVersionId
    ? getDocumentVersionDownloadUrl({ vaultId, documentId, versionId: selectedVersionId })
    : undefined;
  const canPreview = (!activeDocument.isDeleted || isTrashDocumentRoute) && activePreviewKind !== 'unsupported';
  const canPrint = !isHistoricalVersionSelected && !document.isDeleted && canPreview && activePreviewKind !== 'markdown';
  const currentName = renameValue ?? document.name;
  const currentLanguage = languageValue ?? document.language?.code ?? 'unknown';
  const hasNameChanged = currentName.trim() !== document.name;
  const hasLanguageChanged = currentLanguage !== (document.language?.code ?? 'unknown');
  const isMetadataSaving = renameMutation.isPending || languageMutation.isPending;
  const documentLanguageLabel = getDocumentLanguageLabel(document.language);
  const documentFileTypeLabel = getDocumentFileTypeLabel(document.mimeType);
  const normalizedCreateTagName = createTagNameValue.trim();
  const createTagDescription = createTagDescriptionValue.trim();
  const isCreateTagDialogDirty =
    normalizedCreateTagName.length > 0 ||
    createTagDescription.length > 0 ||
    createTagColorValue !== '#D8FF75';
  const isCreateTagSaveDisabled =
    normalizedCreateTagName.length === 0 ||
    createTagMutation.isPending ||
    assignTagMutation.isPending;
  const displayContent = activeDocument.displayContent ?? activeDocument.content;
  const fallbackMarkdownContent = displayContent;
  const extractionStageLabel = getDocumentProcessingStageLabel(
    activeDocument.processingStatus,
    displayContent,
  );
  const extractedTextMessage = getDocumentProcessingStageDescription(
    activeDocument.processingStatus,
    displayContent,
  );
  const extractionStatusDescription = getDocumentProcessingStageDescription(
    activeDocument.processingStatus,
    '',
  );
  const isExtractionActive = isDocumentProcessingActive(activeDocument.processingStatus);
  const showExtractionStatus = isExtractionActive || activeDocument.processingStatus === 'failed';
  const activeChunksQuery = isHistoricalVersionSelected ? documentVersionChunksQuery : documentChunksQuery;
  const documentSectionSearch = routeSearch;
  const documentSectionMenuItems = !isTrashDocumentRoute
    ? [
        {
          key: 'preview',
          label: 'Preview',
          icon: ImageIcon,
          route: ROUTES.vaultDocument(vaultId, documentId),
        },
        ...(canShowExtractedTextTab
          ? [
              {
                key: 'content',
                label: 'Text & chunks',
                icon: ScanText,
                route: ROUTES.vaultDocumentExtractedText(vaultId, documentId),
              },
            ]
          : []),
        {
          key: 'metadata',
          label: 'Metadata',
          icon: Tags,
          route: ROUTES.vaultDocumentMetadata(vaultId, documentId),
        },
        {
          key: 'activity',
          label: 'Activity',
          icon: History,
          route: ROUTES.vaultDocumentActivity(vaultId, documentId),
        },
        ...(aiFeaturesEnabled && canUseVaultChat(vaultQuery.data?.vault)
          ? [
              {
                key: 'chat',
                label: 'Chat',
                icon: MessageSquare,
                route: ROUTES.vaultDocumentChat(vaultId, documentId),
              },
            ]
          : []),
      ]
    : [];

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = currentName.trim() || document.name;

    try {
      if (hasNameChanged) {
        await renameMutation.mutateAsync({ vaultId, documentId, name: nextName });
      }

      if (hasLanguageChanged) {
        await languageMutation.mutateAsync({
          vaultId,
          documentId,
          language: currentLanguage === 'unknown' ? null : currentLanguage,
        });
      }

      if (hasNameChanged || hasLanguageChanged) {
        toast.success('Metadata saved.');
        setRenameValue(null);
        setLanguageValue(null);
        setIsNameEditing(false);
        setIsLanguageEditing(false);
      }
    } catch {}
  }

  async function copyMetadataValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  function openCreateTagDialog(initialName: string) {
    setIsTagPickerOpen(false);
    setCreateTagNameValue(initialName);
    setCreateTagColorValue('#D8FF75');
    setCreateTagDescriptionValue('');
    setIsCreateTagDialogOpen(true);
  }

  function closeCreateTagDialog() {
    if (createTagMutation.isPending || assignTagMutation.isPending) {
      return;
    }

    setIsCreateTagDialogOpen(false);
  }

  async function handleCreateTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizedCreateTagName.length === 0) {
      return;
    }

    try {
      const result = await createTagMutation.mutateAsync({
        name: normalizedCreateTagName,
        color: createTagColorValue,
        description: createTagDescription.length > 0 ? createTagDescription : null,
      });

      await assignTagMutation.mutateAsync({
        vaultId,
        documentId,
        tagId: result.tag.id,
      });
      setIsCreateTagDialogOpen(false);
      setIsTagPickerOpen(false);
      setTagSearchValue('');
    } catch {}
  }

  function handlePrintClick() {
    if (!canPrint) {
      return;
    }

    if (previewKind === 'pdf' || previewKind === 'text') {
      const frame = window.document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = inlineFileUrl;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      window.document.body.appendChild(frame);
      window.setTimeout(() => {
        frame.remove();
      }, 60_000);
      return;
    }

    if (previewKind === 'image') {
      const printWindow = window.open('', '_blank', 'noopener,noreferrer');

      if (printWindow === null) {
        toast.error('Could not open print dialog.');
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>${document.name}</title>
            <style>
              body {
                margin: 0;
                display: flex;
                min-height: 100vh;
                align-items: center;
                justify-content: center;
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100vh;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <img src="${inlineFileUrl}" alt="${document.name}" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    }
  }

  const documentActionMenu = (
    <DocumentActionMenu
      documentName={document.name}
      vaultId={vaultId}
      documentId={documentId}
      isDeleted={document.isDeleted}
      isTrashDocumentRoute={isTrashDocumentRoute}
      canPrint={canPrint}
      sectionMenuItems={documentSectionMenuItems}
      isRestorePending={restoreMutation.isPending}
      isDeletePending={deleteMutation.isPending}
      onNavigateToSection={(route) => navigate({ to: route, search: documentSectionSearch })}
      onPrint={handlePrintClick}
      onOpenVersionsDialog={() => setIsVersionsDialogOpen(true)}
      onRestore={() => {
        restoreMutation.mutate({ vaultId, documentId });
      }}
      onOpenDeleteDialog={() => setIsDeleteDialogOpen(true)}
    />
  );

  const documentTagControls = (
    <Flex flexWrap="wrap" align="center" gap="2" minW="0">
      {isHistoricalVersionSelected ? (
        <Flex
          align="center"
          rounded="full"
          borderWidth="1px"
          borderColor="orange.muted"
          bg="orange.subtle"
          px="3"
          py="1"
          fontSize="xs"
          fontWeight="semibold"
          color="orange.fg"
        >
          {selectedVersion
            ? `Read-only historical v${selectedVersion.versionNumber}`
            : 'Loading historical version'}
        </Flex>
      ) : null}
      {assignedTags.map((tag) => (
        <TagBadge
          key={tag.id}
          color={tag.color}
          name={tag.name}
          onRemove={
            !isTrashDocumentRoute
              ? () => {
                  removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                }
              : undefined
          }
        />
      ))}
      {!isTrashDocumentRoute ? (
        <DropdownMenu
          modal={false}
          open={isTagPickerOpen}
          onOpenChange={(open) => {
            setIsTagPickerOpen(open);
            if (!open) {
              setTagSearchValue('');
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Add tag"
              borderStyle="dashed"
              color="fg.muted"
              _hover={{ bg: 'bg.surface', color: 'fg' }}
            >
              <Plus size={8} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            minW="80"
            overflow="hidden"
            rounded="xl"
            bg="bg.surface"
            p="0"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            <Box borderBottomWidth="1px" borderColor="border.surface" p="2">
              <Field>
                <FieldLabel htmlFor="document-detail-tag-filter" srOnly>
                  Filter tags
                </FieldLabel>
                <Input
                  id="document-detail-tag-filter"
                  type="text"
                  value={tagSearchValue}
                  onChange={(event) => setTagSearchValue(event.target.value)}
                  placeholder="Filter tags..."
                  size="md"
                  borderColor="transparent"
                  focusRing="none"
                  autoFocus
                />
              </Field>
            </Box>
            <Box maxH="72" overflowY="auto" overflowX="hidden" py="1">
              {selectedMatchingTags.map((tag) => (
                <chakra.button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked="true"
                  display="flex"
                  w="full"
                  alignItems="center"
                  gap="3"
                  px="4"
                  py="2.5"
                  textAlign="left"
                  color="fg"
                  _hover={{ bg: 'bg.subtle' }}
                  _focusVisible={{
                    outline: '2px solid',
                    outlineColor: 'teal.solid',
                    outlineOffset: '-2px',
                  }}
                  onClick={() => {
                    removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                  }}
                >
                  <Flex
                    aria-hidden="true"
                    boxSize="6"
                    flexShrink={0}
                    align="center"
                    justify="center"
                    rounded="md"
                    bg="#D8FF75"
                    color="#111827"
                  >
                    <Check size={17} strokeWidth={2.4} />
                  </Flex>
                  <Box
                    aria-hidden="true"
                    boxSize="2.5"
                    flexShrink={0}
                    rounded="full"
                    bg={tag.color ?? '#64748b'}
                  />
                  <Text flex="1" minW="0" fontWeight="semibold" color="fg" truncate>
                    {tag.name}
                  </Text>
                </chakra.button>
              ))}
              {selectedMatchingTags.length > 0 && sortedFilteredAvailableTags.length > 0 ? (
                <DropdownMenuSeparator />
              ) : null}
              {sortedFilteredAvailableTags.map((tag) => (
                <chakra.button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked="false"
                  display="flex"
                  w="full"
                  alignItems="center"
                  gap="3"
                  px="4"
                  py="2.5"
                  textAlign="left"
                  color="fg"
                  _hover={{ bg: 'bg.subtle' }}
                  _focusVisible={{
                    outline: '2px solid',
                    outlineColor: 'teal.solid',
                    outlineOffset: '-2px',
                  }}
                  onClick={() => {
                    assignTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                  }}
                >
                  <Box aria-hidden="true" boxSize="6" flexShrink={0} />
                  <Box
                    aria-hidden="true"
                    boxSize="2.5"
                    flexShrink={0}
                    rounded="full"
                    bg={tag.color ?? '#64748b'}
                  />
                  <Text flex="1" minW="0" fontWeight="semibold" color="fg" truncate>
                    {tag.name}
                  </Text>
                </chakra.button>
              ))}
              {normalizedTagSearchValue.length > 0 && !hasExactTagMatch ? (
                <DropdownMenuItem onSelect={() => openCreateTagDialog(tagSearchValue.trim())}>
                  <Plus size={16} />
                  <Text flex="1" minW="0" truncate>{`New tag "${tagSearchValue.trim()}"`}</Text>
                </DropdownMenuItem>
              ) : null}
              {selectedMatchingTags.length === 0 && sortedFilteredAvailableTags.length === 0 ? (
                normalizedTagSearchValue.length === 0 ? (
                  <Text px="4" py="3" fontSize="sm" color="fg.muted">
                    All tags are already assigned.
                  </Text>
                ) : !hasExactTagMatch ? null : (
                  <Text px="4" py="3" fontSize="sm" color="fg.muted">
                    No matching tags.
                  </Text>
                )
              ) : null}
            </Box>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </Flex>
  );

  return (
    <Flex
      as="section"
      direction="column"
      h="full"
      minH="0"
      gap="0"
      px={isTrashDocumentRoute ? { base: '4', lg: '6' } : undefined}
      pt={isTrashDocumentRoute ? '4' : { base: '3', md: '4' }}
      pb="0"
    >
      <DocumentViewHeader
        title={getDocumentTitle(document.name)}
        subtitle={documentTagControls}
        mimeType={activeDocument.mimeType}
        actions={documentActionMenu}
        onClose={closeDocumentDetail}
      />

      <Box flex="1" h="full" minH="0" pt={detailActiveSection === 'content' ? '3' : '6'}>
        {detailActiveSection === 'preview' ? (
          <DocumentPreviewSection
            previewKind={activePreviewKind}
            canPreview={canPreview}
            inlineFileUrl={inlineFileUrl}
            document={activeDocument}
            vaultId={vaultId}
            documentId={documentId}
            isTrashDocumentRoute={isTrashDocumentRoute}
            aiFeaturesEnabled={aiFeaturesEnabled}
            markdownSource={markdownSourceQuery.data}
            isMarkdownLoading={markdownSourceQuery.isLoading}
            isMarkdownError={markdownSourceQuery.isError}
            fallbackMarkdownContent={fallbackMarkdownContent}
            isHistoricalVersion={isHistoricalVersionSelected}
            historicalDownloadUrl={historicalDownloadUrl}
            onPrint={handlePrintClick}
          />
        ) : null}

        {detailActiveSection === 'content' ? (
          <DocumentContentSection
            processingStatus={activeDocument.processingStatus}
            showExtractionStatus={showExtractionStatus}
            extractionStageLabel={extractionStageLabel}
            extractionStatusDescription={extractionStatusDescription}
            extractedTextMessage={extractedTextMessage}
            documentContentTab={documentContentTab}
            onDocumentContentTabChange={setDocumentContentTab}
            chunks={activeChunksQuery.data?.chunks ?? []}
            isChunksLoading={activeChunksQuery.isLoading}
            isChunksError={activeChunksQuery.isError}
          />
        ) : null}

        {detailActiveSection === 'metadata' ? (
          <DocumentMetadataSection
            document={document}
            documentLanguageLabel={documentLanguageLabel}
            documentFileTypeLabel={documentFileTypeLabel}
            currentName={currentName}
            currentLanguage={currentLanguage}
            isNameEditing={isNameEditing}
            isLanguageEditing={isLanguageEditing}
            isTrashDocumentRoute={isTrashDocumentRoute}
            isMetadataSaving={isMetadataSaving}
            hasNameChanged={hasNameChanged}
            hasLanguageChanged={hasLanguageChanged}
            onNameChange={setRenameValue}
            onLanguageChange={setLanguageValue}
            onEditName={() => setIsNameEditing(true)}
            onEditLanguage={() => setIsLanguageEditing(true)}
            onCopyMetadataValue={(value, label) => {
              void copyMetadataValue(value, label);
            }}
            onSubmit={handleMetadataSave}
          />
        ) : null}

        {detailActiveSection === 'activity' ? (
          <DocumentActivityPanel vaultId={vaultId} documentId={documentId} />
        ) : null}
      </Box>

      <ChakraDialog.Root
        open={isDeleteDialogOpen}
        onOpenChange={(e) => {
          if (!deleteMutation.isPending) {
            setIsDeleteDialogOpen(e.open);
          }
        }}
        size={{ mdDown: 'full', md: 'lg' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>{`Move "${document.name}" to trash?`}</ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Text color="fg.muted" fontSize="sm">
                  This document will be removed from the active vault, but it is recoverable from
                  Trash until it is permanently removed manually or automatically after 30 days.
                </Text>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleteMutation.isPending}
                    onClick={() => setIsDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                <DeleteButton
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    deleteMutation.mutate({ vaultId, documentId });
                  }}
                >
                  {deleteMutation.isPending ? 'Moving...' : 'Trash'}
                </DeleteButton>
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <DocumentVersionsDialog
        open={isVersionsDialogOpen}
        onOpenChange={setIsVersionsDialogOpen}
        vaultId={vaultId}
        documentId={documentId}
        versions={documentVersionsQuery.data?.versions ?? []}
        isLoading={documentVersionsQuery.isLoading}
        isError={documentVersionsQuery.isError}
        selectedVersionId={selectedVersionId}
        isRestorePending={restoreVersionMutation.isPending}
        isDeletePending={deleteVersionMutation.isPending}
        onSelectVersion={(versionId) => {
          setSelectedVersionState({ key: documentVersionSelectionKey, versionId });
          setIsVersionsDialogOpen(false);
        }}
        onRestoreVersion={async (version: DocumentVersionSummary) => {
          await restoreVersionMutation.mutateAsync({ vaultId, documentId, versionId: version.id });
        }}
        onDeleteVersion={async (version: DocumentVersionSummary) => {
          await deleteVersionMutation.mutateAsync({ vaultId, documentId, versionId: version.id });
        }}
      />

      <TagDialog
        isOpen={isCreateTagDialogOpen}
        title="New tag"
        submitLabel="Create"
        pendingLabel="Creating..."
        closeLabel="Close create tag dialog"
        isPending={createTagMutation.isPending || assignTagMutation.isPending}
        isDirty={isCreateTagDialogDirty}
        isSubmitDisabled={isCreateTagSaveDisabled}
        nameValue={createTagNameValue}
        colorValue={createTagColorValue}
        descriptionValue={createTagDescriptionValue}
        onNameChange={setCreateTagNameValue}
        onColorChange={setCreateTagColorValue}
        onDescriptionChange={setCreateTagDescriptionValue}
        onClose={closeCreateTagDialog}
        onSubmit={handleCreateTagSubmit}
      />
    </Flex>
  );
}

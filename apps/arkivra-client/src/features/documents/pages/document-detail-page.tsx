import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import { validateVaultWorkspaceSearch } from '@/app/search-params';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';
import { DocumentActionMenu } from '@/features/documents/components/detail/document-action-menu';
import { DocumentContentSection } from '@/features/documents/components/detail/document-content-section';
import type { DocumentContentTab } from '@/features/documents/components/detail/document-content-section';
import { DocumentMetadataSection } from '@/features/documents/components/detail/document-metadata-section';
import { DocumentPreviewSection } from '@/features/documents/components/detail/document-preview-section';
import { DocumentViewHeader } from '@/features/documents/components/detail/document-view-header';
import {
  deleteDocumentVersion,
  getDocumentInlineFileUrl,
  getDocumentVersionDownloadUrl,
  getDocumentDuplicateConflict,
  renameDocument,
  restoreDocument,
  restoreDocumentVersion,
  softDeleteDocument,
  updateDocumentLanguage,
} from '@/features/documents/documents.api';
import { invalidateDocumentCollectionCaches } from '@/features/documents/document-cache-updates';
import type { DocumentDuplicateConflict } from '@/features/documents/documents.api';
import type { DocumentVersionSummary } from '@/features/documents/documents.types';
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
import { removeTrashTargetsFromFileBrowserCache } from '@/features/documents/hooks/use-file-browser-mutations';
import {
  getDocumentProcessingStageDescription,
  getDocumentProcessingStageLabel,
  isDocumentProcessingActive,
} from '@/features/documents/documents.utils';
import { assignTagToDocument, createTag, removeTagFromDocument } from '@/features/tags/tags.api';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';
import { DocumentActivityPanel } from '@/features/audit/components/document-activity-panel';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { useVaultQuery } from '@/features/vaults/vaults.queries';

import {
  getActiveDocumentDetail,
  getDocumentSectionMenuItems,
  getDocumentFileTypeLabel,
  getDocumentLanguageLabel,
  getDocumentTagPickerState,
  getDocumentTitle,
  getPreviewKind,
  getSearchReturnParams,
  printDocumentPreview,
} from './document-detail-page.helpers';
import type { DocumentSection } from './document-detail-page.helpers';
import { DocumentDetailDialogs } from './document-detail-page-dialogs';
import { DocumentDetailTagControls } from './document-detail-page-tags';
export type { DocumentSection } from './document-detail-page.helpers';
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
      (previewKind === 'markdown' || previewKind === 'text') &&
      (documentQuery.data?.document.isDeleted === false || isTrashDocumentRoute),
  });

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [languageValue, setLanguageValue] = useState<string | null>(null);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [isLanguageEditing, setIsLanguageEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [restoreConflict, setRestoreConflict] = useState<DocumentDuplicateConflict | null>(null);
  const [isVersionsDialogOpen, setIsVersionsDialogOpen] = useState(false);
  const documentVersionSelectionKey = `${vaultId}:${documentId}`;
  const [selectedVersionState, setSelectedVersionState] = useState<{
    key: string;
    versionId: string | null;
  }>({ key: documentVersionSelectionKey, versionId: null });
  const selectedVersionId =
    selectedVersionState.key === documentVersionSelectionKey
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
      invalidateDocumentCollectionCaches(queryClient),
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
    onSuccess: async (_data, variables) => {
      toast.success('Document moved to trash.');
      setIsDeleteDialogOpen(false);
      removeTrashTargetsFromFileBrowserCache(queryClient, [
        {
          type: 'document',
          vaultId: variables.vaultId,
          id: variables.documentId,
        },
      ]);
      await invalidateDocument();
      navigate({ to: parentRoute, replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async (data, variables) => {
      toast.success(data.skipped ? 'Restore skipped.' : 'Document restored.');
      if (variables.conflictStrategy !== undefined) {
        setRestoreConflict(null);
      }
      await invalidateDocument();
      if (isTrashDocumentRoute && !data.skipped) {
        navigate({ to: ROUTES.trash, replace: true });
      }
    },
    onError: (error) => {
      const conflict = getDocumentDuplicateConflict(error);
      if (conflict !== null && conflict.availableStrategies.length > 0) {
        setRestoreConflict(conflict);
        return;
      }

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
      return <Text fontSize="sm" color="fg.muted">Loading document...</Text>;
    }

    return <Text fontSize="sm" color="fg.error">Invalid document route.</Text>;
  }

  if (documentQuery.isLoading || (isTrashDocumentRoute && deletedDocumentsQuery.isLoading)) {
    return <Text fontSize="sm" color="fg.muted">Loading document...</Text>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return <Text fontSize="sm" color="fg.error">Unable to load document.</Text>;
  }

  const document = documentQuery.data.document;
  const selectedVersionSummary =
    selectedVersionId === null
      ? null
      : (documentVersionsQuery.data?.versions.find((version) => version.id === selectedVersionId) ??
        null);
  const selectedVersionDetail = selectedDocumentVersionQuery.data?.version ?? null;
  const selectedVersion = selectedVersionDetail ?? selectedVersionSummary;
  const isHistoricalVersionSelected = selectedVersionId !== null;
  const activeDocument = getActiveDocumentDetail({
    document,
    selectedVersionDetail: isHistoricalVersionSelected ? selectedVersionDetail : null,
  });
  const activePreviewKind = getPreviewKind(
    activeDocument.mimeType,
    activeDocument.name,
    activeDocument.originalName,
  );
  const assignedTags = documentTagsQuery.data?.tags ?? [];
  const availableTags = (tagsQuery.data?.tags ?? []).filter(
    (tag) => !assignedTags.some((assigned) => assigned.id === tag.id),
  );
  const {
    hasExactTagMatch,
    normalizedSearchValue: normalizedTagSearchValue,
    selectedMatchingTags,
    sortedFilteredAvailableTags,
  } = getDocumentTagPickerState({
    assignedTags,
    availableTags,
    searchValue: tagSearchValue,
  });
  const inlineFileUrl = getDocumentInlineFileUrl({
    vaultId,
    documentId,
    includeDeleted: isTrashDocumentRoute,
  });
  const historicalDownloadUrl = selectedVersionId
    ? getDocumentVersionDownloadUrl({ vaultId, documentId, versionId: selectedVersionId })
    : undefined;
  const canPreview =
    (!activeDocument.isDeleted || isTrashDocumentRoute) && activePreviewKind !== 'unsupported';
  const canPrint =
    !isHistoricalVersionSelected &&
    !document.isDeleted &&
    canPreview &&
    activePreviewKind !== 'markdown';
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
  const activeChunksQuery = isHistoricalVersionSelected
    ? documentVersionChunksQuery
    : documentChunksQuery;
  const documentSectionSearch = routeSearch;
  const documentSectionMenuItems = getDocumentSectionMenuItems({
    aiFeaturesEnabled,
    canShowExtractedTextTab,
    documentId,
    isTrashDocumentRoute,
    vault: vaultQuery.data?.vault,
    vaultId,
  });

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
    printDocumentPreview({
      canPrint,
      documentName: document.name,
      inlineFileUrl,
      previewKind,
      onPrintWindowError: () => toast.error('Could not open print dialog.'),
    });
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
    <DocumentDetailTagControls
      assignedTags={assignedTags}
      availableTags={sortedFilteredAvailableTags}
      selectedTags={selectedMatchingTags}
      isTrashDocumentRoute={isTrashDocumentRoute}
      isTagPickerOpen={isTagPickerOpen}
      tagSearchValue={tagSearchValue}
      normalizedTagSearchValue={normalizedTagSearchValue}
      hasExactTagMatch={hasExactTagMatch}
      historicalVersionLabel={
        isHistoricalVersionSelected
          ? selectedVersion
            ? `Read-only historical v${selectedVersion.versionNumber}`
            : 'Loading historical version'
          : null
      }
      onAssignTag={(tagId) => {
        assignTagMutation.mutate({ vaultId, documentId, tagId });
      }}
      onOpenChange={(open) => {
        setIsTagPickerOpen(open);
        if (!open) {
          setTagSearchValue('');
        }
      }}
      onOpenCreateTagDialog={openCreateTagDialog}
      onRemoveTag={(tagId) => {
        removeTagMutation.mutate({ vaultId, documentId, tagId });
      }}
      onSearchValueChange={setTagSearchValue}
    />
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

      <DocumentDetailDialogs
        documentName={document.name}
        isDeleteDialogOpen={isDeleteDialogOpen}
        isDeletePending={deleteMutation.isPending}
        restoreConflict={restoreConflict}
        isRestorePending={restoreMutation.isPending}
        isVersionsDialogOpen={isVersionsDialogOpen}
        vaultId={vaultId}
        documentId={documentId}
        versions={documentVersionsQuery.data?.versions ?? []}
        isVersionsLoading={documentVersionsQuery.isLoading}
        isVersionsError={documentVersionsQuery.isError}
        selectedVersionId={selectedVersionId}
        isRestoreVersionPending={restoreVersionMutation.isPending}
        isDeleteVersionPending={deleteVersionMutation.isPending}
        isCreateTagDialogOpen={isCreateTagDialogOpen}
        isCreateTagPending={createTagMutation.isPending || assignTagMutation.isPending}
        isCreateTagDialogDirty={isCreateTagDialogDirty}
        isCreateTagSaveDisabled={isCreateTagSaveDisabled}
        createTagNameValue={createTagNameValue}
        createTagColorValue={createTagColorValue}
        createTagDescriptionValue={createTagDescriptionValue}
        onCreateTagColorChange={setCreateTagColorValue}
        onCreateTagDescriptionChange={setCreateTagDescriptionValue}
        onCreateTagNameChange={setCreateTagNameValue}
        onCreateTagSubmit={handleCreateTagSubmit}
        onDelete={() => {
          deleteMutation.mutate({ vaultId, documentId });
        }}
        onDeleteDialogOpenChange={setIsDeleteDialogOpen}
        onDeleteVersion={async (version: DocumentVersionSummary) => {
          await deleteVersionMutation.mutateAsync({ vaultId, documentId, versionId: version.id });
        }}
        onRestoreConflictOpenChange={(open) => {
          if (!open) {
            setRestoreConflict(null);
          }
        }}
        onRestoreConflictStrategy={(strategy) => {
          restoreMutation.mutate({ vaultId, documentId, conflictStrategy: strategy });
        }}
        onRestoreVersion={async (version: DocumentVersionSummary) => {
          await restoreVersionMutation.mutateAsync({ vaultId, documentId, versionId: version.id });
        }}
        onSelectVersion={(versionId) => {
          setSelectedVersionState({ key: documentVersionSelectionKey, versionId });
          setIsVersionsDialogOpen(false);
        }}
        onVersionsDialogOpenChange={setIsVersionsDialogOpen}
        onCloseCreateTagDialog={closeCreateTagDialog}
      />
    </Flex>
  );
}

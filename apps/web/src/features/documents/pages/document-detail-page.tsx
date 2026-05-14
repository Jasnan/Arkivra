import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Flex, Text, CloseButton, Dialog as ChakraDialog, Portal, chakra, Heading } from '@chakra-ui/react';
import {
  ArrowLeft,
  Download,
  Image as ImageIcon,
  MessageSquare,
  Pencil,
  ScanText,
  Tags,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { DeleteButton, SaveButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatWorkspace } from '@/features/chat/components/chat-workspace';
import { DocumentMarkdownPreview } from '@/features/documents/components/document-markdown-preview';
import {
  getDocumentDownloadUrl,
  getDocumentInlineFileUrl,
  renameDocument,
  restoreDocument,
  softDeleteDocument,
  updateDocumentDate,
} from '@/features/documents/documents.api';
import {
  documentQueryKeys,
  useDocumentFileTextQuery,
  useDocumentQuery,
  useDocumentTagsQuery,
} from '@/features/documents/documents.queries';
import {
  formatBytes,
  formatDate,
  getDocumentProcessingStageDescription,
  getDocumentProcessingStageLabel,
  isDocumentProcessingActive,
} from '@/features/documents/documents.utils';
import { assignTagToDocument, createTag, removeTagFromDocument } from '@/features/tags/tags.api';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { useVaultQuery } from '@/features/vaults/vaults.queries';

type PreviewKind = 'pdf' | 'image' | 'markdown' | 'text' | 'unsupported';
type DetailTab = 'preview' | 'content' | 'metadata' | 'chat';

const documentTabTriggerStyles = {
  h: '11',
  roundedTop: 'md',
  roundedBottom: '0',
  borderBottomWidth: '2px',
  borderColor: 'transparent',
  px: '3',
  pb: '3',
  pt: '2',
  color: 'fg.muted',
  _hover: { bg: 'teal.subtle', color: 'fg' },
  _selected: {
    bg: 'teal.subtle',
    borderColor: 'teal.solid',
    color: 'teal.fg',
    shadow: 'none',
  },
} as const;

const searchReturnParamKeys = ['q', 'vaultId', 'tagId', 'dateFrom', 'dateTo', 'sortBy'] as const;

function getSearchReturnParams(search: Record<string, unknown>) {
  if (search.source !== 'search') {
    return null;
  }

  const params: Record<string, string> = {};

  for (const key of searchReturnParamKeys) {
    const value = search[key];
    if (typeof value === 'string' && value.length > 0) {
      params[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      params[key] = String(value);
    }
  }

  return params;
}

function isMarkdownDocument({ mimeType, name, originalName }: { mimeType: string; name: string; originalName: string }) {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedNames = [name, originalName].map(value => value.toLowerCase());

  return (
    normalizedMimeType === 'text/markdown' ||
    normalizedMimeType === 'text/x-markdown' ||
    normalizedMimeType === 'application/markdown' ||
    normalizedMimeType === 'application/x-markdown' ||
    normalizedNames.some(normalizedName =>
      normalizedName.endsWith('.md') ||
      normalizedName.endsWith('.markdown') ||
      normalizedName.endsWith('.mdown') ||
      normalizedName.endsWith('.mkd'),
    )
  );
}

function getPreviewKind(mimeType: string, name: string, originalName: string): PreviewKind {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType.startsWith('image/')) {
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

export function DocumentDetailPage() {
  const params = useParams({ strict: false }) as { vaultId?: string; documentId?: string };
  const vaultId = params.vaultId ?? '';
  const documentId = params.documentId ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const parentRoute = ROUTES.vaultRoot(vaultId);

  const documentQuery = useDocumentQuery({ vaultId, documentId });
  const documentTagsQuery = useDocumentTagsQuery({ vaultId, documentId });
  const tagsQuery = useTagsQuery();
  const vaultQuery = useVaultQuery({ vaultId });
  const folderTreeQuery = useFolderTreeQuery({ vaultId, enabled: vaultId.length > 0 });
  const previewKind = getPreviewKind(
    documentQuery.data?.document.mimeType ?? '',
    documentQuery.data?.document.name ?? '',
    documentQuery.data?.document.originalName ?? '',
  );
  const markdownSourceQuery = useDocumentFileTextQuery({
    vaultId,
    documentId,
    enabled: previewKind === 'markdown' && documentQuery.data?.document.isDeleted === false,
  });

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [documentDateValue, setDocumentDateValue] = useState<string | null>(null);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [isDocumentDateEditing, setIsDocumentDateEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>(
    location.pathname.endsWith('/chat') ? 'chat' : 'preview',
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagSearchValue, setTagSearchValue] = useState('');
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
  const [createTagNameValue, setCreateTagNameValue] = useState('');
  const [createTagColorValue, setCreateTagColorValue] = useState('#D8FF75');
  const [createTagDescriptionValue, setCreateTagDescriptionValue] = useState('');

  const documentBreadcrumbFolders = useMemo(() => {
    const folderId = documentQuery.data?.document.folderId;
    const folders = folderTreeQuery.data?.folders ?? [];

    if (!folderId) {
      return [];
    }

    const foldersById = new Map(folders.map(folder => [folder.id, folder]));
    const path: typeof folders = [];
    let current = foldersById.get(folderId);

    while (current) {
      path.unshift(current);
      current = current.parentId ? foldersById.get(current.parentId) : undefined;
    }

    return path;
  }, [documentQuery.data?.document.folderId, folderTreeQuery.data?.folders]);
  const searchReturnParams = useMemo(
    () => getSearchReturnParams(location.search as Record<string, unknown>),
    [location.search],
  );

  const documentBreadcrumbEntries = useMemo<VaultBreadcrumbEntry[]>(() => [
    ...(searchReturnParams
      ? [{
          key: 'search-results',
          label: 'Search results',
          onClick: () => navigate({ to: ROUTES.search, search: searchReturnParams as any }),
        }]
      : [{ key: 'vaults', label: 'Vaults', to: ROUTES.vaults }]),
    {
      key: `vault-${vaultId}`,
      label: vaultQuery.data?.vault.name ?? 'Vault',
      onClick: () => navigate({ to: ROUTES.vaultRoot(vaultId) }),
    },
    ...documentBreadcrumbFolders.map(folder => ({
      key: `folder-${folder.id}`,
      label: folder.name,
      onClick: () => navigate({
        to: ROUTES.vaultRoot(vaultId),
        search: { folderId: folder.id } as any,
      }),
    })),
    {
      key: `document-${documentId}`,
      label: documentQuery.data?.document.name ?? 'Document',
    },
  ], [
    documentBreadcrumbFolders,
    documentId,
    documentQuery.data?.document.name,
    navigate,
    searchReturnParams,
    vaultId,
    vaultQuery.data?.vault.name,
  ]);

  const documentWorkspaceHeader = useMemo(() => ({
    left: <VaultRouteBreadcrumbs entries={documentBreadcrumbEntries} />,
  }), [documentBreadcrumbEntries]);
  useWorkspaceHeader(documentWorkspaceHeader);

  function returnToSearchResults() {
    if (!searchReturnParams) {
      return;
    }

    navigate({ to: ROUTES.search, search: searchReturnParams as any });
  }

  useEffect(() => {
    if (location.pathname.endsWith('/chat')) {
      setActiveTab('chat');
    }
  }, [location.pathname]);

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
    await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list() });
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

  const dateMutation = useMutation({
    mutationFn: updateDocumentDate,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update document date.');
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
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore document.');
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
    return <Text fontSize="sm" color="fg.error">Invalid document route.</Text>;
  }

  if (documentQuery.isLoading) {
    return <Text fontSize="sm" color="fg.muted">Loading document...</Text>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return <Text fontSize="sm" color="fg.error">Unable to load document.</Text>;
  }

  const document = documentQuery.data.document;
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
  const inlineFileUrl = getDocumentInlineFileUrl({ vaultId, documentId });
  const canPreview = !document.isDeleted && previewKind !== 'unsupported';
  const canPrint = !document.isDeleted && canPreview && previewKind !== 'markdown';
  const currentName = renameValue ?? document.name;
  const currentDocumentDate =
    documentDateValue ?? (document.documentDate ? document.documentDate.slice(0, 10) : '');
  const hasNameChanged = currentName.trim() !== document.name;
  const hasDocumentDateChanged =
    currentDocumentDate !== (document.documentDate ? document.documentDate.slice(0, 10) : '');
  const isMetadataSaving = renameMutation.isPending || dateMutation.isPending;
  const normalizedCreateTagName = createTagNameValue.trim();
  const createTagDescription = createTagDescriptionValue.trim();
  const isCreateTagSaveDisabled =
    normalizedCreateTagName.length === 0 ||
    createTagMutation.isPending ||
    assignTagMutation.isPending;
  const displayContent = document.displayContent ?? document.content;
  const fallbackMarkdownContent = displayContent;
  const extractionStageLabel = getDocumentProcessingStageLabel(
    document.processingStatus,
    displayContent,
  );
  const extractedTextMessage = getDocumentProcessingStageDescription(
    document.processingStatus,
    displayContent,
  );
  const isExtractionActive = isDocumentProcessingActive(document.processingStatus);

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = currentName.trim() || document.name;

    try {
      if (hasNameChanged) {
        await renameMutation.mutateAsync({ vaultId, documentId, name: nextName });
      }

      if (hasDocumentDateChanged) {
        await dateMutation.mutateAsync({
          vaultId,
          documentId,
          documentDate: currentDocumentDate ? new Date(currentDocumentDate).toISOString() : null,
        });
      }

      if (hasNameChanged || hasDocumentDateChanged) {
        toast.success('Metadata saved.');
        setRenameValue(null);
        setDocumentDateValue(null);
        setIsNameEditing(false);
        setIsDocumentDateEditing(false);
      }
    } catch {}
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

  return (
    <Flex
      as="section"
      direction="column"
      h={activeTab === 'chat' ? 'full' : undefined}
      minH="0"
      gap="0"
      pb="0"
    >
      <Flex
        as="header"
        direction="column"
        align="stretch"
        gap="5"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        pb="0"
      >
        <Flex align="center" justify="space-between" gap="4" pt={{ base: '1', md: '0' }}>
          <Flex align="center" gap="3" minW="0">
            <Heading
              as="h1"
              textStyle="xl"
              fontWeight="semibold"
              lineHeight="short"
              truncate
            >
              {document.name}
            </Heading>
            <Box
              as="span"
              flexShrink={0}
              rounded="md"
              bg="teal.subtle"
              px="2"
              py="1"
              fontSize="xs"
              fontWeight="medium"
              color="teal.fg"
            >
              Document
            </Box>
          </Flex>

          <Flex align="center" gap="2">
            {searchReturnParams ? (
              <Button type="button" size="sm" variant="outline" onClick={returnToSearchResults}>
                <ArrowLeft size={16} />
                Search results
              </Button>
            ) : null}

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <ActionMenuTriggerButton label={`Open actions for ${document.name}`} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" minW="56">
                <DropdownMenuItem asChild>
                  <a href={getDocumentDownloadUrl({ vaultId, documentId })}>
                    <ActionMenuItemIcon icon={Download} />
                    Download original
                  </a>
                </DropdownMenuItem>
                {canPrint ? (
                  <DropdownMenuItem onSelect={handlePrintClick}>
                    <ActionMenuItemIcon icon={Printer} />
                    Print
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                {document.isDeleted ? (
                  <DropdownMenuItem
                    disabled={restoreMutation.isPending}
                    onSelect={() => {
                      restoreMutation.mutate({ vaultId, documentId });
                    }}
                  >
                    <ActionMenuItemIcon icon={RotateCcw} />
                    {restoreMutation.isPending ? 'Restoring...' : 'Restore document'}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    color="fg.error"
                    _hover={{ bg: 'bg.error', color: 'fg.error' }}
                    _focus={{ bg: 'bg.error', color: 'fg.error' }}
                    disabled={deleteMutation.isPending}
                    onSelect={() => setIsDeleteDialogOpen(true)}
                  >
                    <ActionMenuItemIcon icon={Trash2} tone="destructive" />
                    Move to trash
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </Flex>
        </Flex>

        <Flex align="center" justify="space-between" gap="3" overflowX="auto">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)}>
            <TabsList gap="2" rounded="0" bg="transparent" p="0">
              <TabsTrigger
                value="preview"
                {...documentTabTriggerStyles}
              >
                <ImageIcon size={16} />
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="content"
                {...documentTabTriggerStyles}
              >
                <ScanText size={16} />
                Extracted text
              </TabsTrigger>
              <TabsTrigger
                value="metadata"
                {...documentTabTriggerStyles}
              >
                <Tags size={16} />
                Metadata
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                {...documentTabTriggerStyles}
              >
                <MessageSquare size={16} />
                Chat
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </Flex>
      </Flex>

      <Box
        flex={activeTab === 'chat' ? '1' : undefined}
        h={activeTab === 'chat' ? 'full' : undefined}
        minH={activeTab === 'chat' ? '0' : { base: '720px', md: '860px' }}
        pt={activeTab === 'chat' ? '0' : '5'}
      >
            {activeTab === 'preview' ? (
              <Flex direction="column" gap="4">
                {previewKind === 'pdf' && !document.isDeleted ? (
                  <Box overflow="hidden" rounded="lg" bg="bg.subtle" p="2">
                    <chakra.iframe
                      title="Document preview"
                      src={inlineFileUrl}
                      h={{ base: '82vh', md: '860px' }}
                      w="full"
                      rounded="lg"
                      bg="white"
                    />
                  </Box>
                ) : null}

                {previewKind === 'image' && !document.isDeleted ? (
                  <Box overflow="hidden" rounded="lg" bg="bg.subtle" p="4">
                    <Flex
                      h={{ base: '82vh', md: '860px' }}
                      align="center"
                      justify="center"
                      rounded="lg"
                      bg="white"
                      p="8"
                    >
                      <chakra.img
                        src={inlineFileUrl}
                        alt={document.name}
                        maxH="84vh"
                        w="auto"
                        maxW="full"
                        objectFit="contain"
                      />
                    </Flex>
                  </Box>
                ) : null}

                {previewKind === 'text' && !document.isDeleted ? (
                  <Box overflow="hidden" rounded="lg" bg="bg.subtle" p="2">
                    <chakra.iframe
                      title="Text preview"
                      src={inlineFileUrl}
                      h={{ base: '82vh', md: '860px' }}
                      w="full"
                      rounded="lg"
                      bg="white"
                    />
                  </Box>
                ) : null}

                {previewKind === 'markdown' && !document.isDeleted ? (
                  <Box overflow="hidden" rounded="lg" bg="bg.subtle" p="2">
                    <Box
                      h={{ base: '82vh', md: '860px' }}
                      overflow="auto"
                      rounded="lg"
                      borderWidth="1px"
                      borderColor="border.subtle"
                      bg="bg.surface"
                      px={{ base: '4', md: '8' }}
                      py={{ base: '5', md: '7' }}
                    >
                      {markdownSourceQuery.isLoading && markdownSourceQuery.data === undefined ? (
                        <Text fontSize="sm" color="fg.muted">Loading Markdown preview...</Text>
                      ) : markdownSourceQuery.isError && fallbackMarkdownContent.length === 0 ? (
                        <Text fontSize="sm" color="fg.error">Unable to load Markdown preview.</Text>
                      ) : (
                        <DocumentMarkdownPreview markdown={markdownSourceQuery.data ?? fallbackMarkdownContent} />
                      )}
                    </Box>
                  </Box>
                ) : null}

                {previewKind === 'unsupported' || document.isDeleted ? (
                  <Box rounded="lg" bg="bg.subtle" p="6">
                    <Flex
                      minH="820px"
                      direction="column"
                      align="center"
                      justify="center"
                      gap="4"
                      rounded="lg"
                      borderWidth="1px"
                      borderStyle="dashed"
                      borderColor="border.subtle"
                      bg="bg.surface"
                      px="6"
                      textAlign="center"
                    >
                      <ImageIcon size={40} />
                      <Box>
                        <Text fontSize="sm" fontWeight="semibold" color="fg">
                          Preview unavailable
                        </Text>
                        <Text maxW="xl" fontSize="sm" lineHeight="6" color="fg.muted">
                          {document.isDeleted
                            ? 'Preview is disabled for documents in trash. Restore the document to preview or print it again.'
                            : 'This file type is supported for storage and extraction, but Arkivra does not render a faithful in-browser preview for it yet.'}
                        </Text>
                      </Box>
                    </Flex>
                  </Box>
                ) : null}
              </Flex>
            ) : null}

            {activeTab === 'content' ? (
              <Flex direction="column" gap="3">
                <Flex flexWrap="wrap" align="center" gap="3">
                  <Box
                    as="span"
                    display="inline-flex"
                    alignItems="center"
                    rounded="full"
                    px="3"
                    py="1"
                    fontSize="xs"
                    fontWeight="semibold"
                    textTransform="uppercase"
                    letterSpacing="wide"
                    bg={
                      document.processingStatus === 'failed'
                        ? 'bg.error'
                        : isExtractionActive
                          ? 'bg.warning'
                          : 'bg.success'
                    }
                    color={
                      document.processingStatus === 'failed'
                        ? 'fg.error'
                        : isExtractionActive
                          ? 'fg.warning'
                          : 'fg.success'
                    }
                  >
                    {extractionStageLabel}
                  </Box>
                  <Text fontSize="sm" lineHeight="6" color="fg.muted">
                    {isExtractionActive
                      ? 'The document detail view polls the backend while processing is in progress.'
                      : 'OCR and extracted text appear here after processing completes.'}
                  </Text>
                </Flex>
                <Box
                  h={{ base: '82vh', md: '820px' }}
                  overflow="auto"
                  rounded="lg"
                  bg="bg.subtle"
                  p="5"
                  fontSize="sm"
                  whiteSpace="pre-wrap"
                  wordBreak="break-word"
                  color="fg"
                >
                  {extractedTextMessage}
                </Box>
              </Flex>
            ) : null}

            {activeTab === 'metadata' ? (
              <chakra.form minH="820px" onSubmit={handleMetadataSave}>
                <Flex
                  direction={{ base: 'column', sm: 'row' }}
                  flexWrap="wrap"
                  gap="4"
                  fontSize="sm"
                >
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Display name</Text>
                    {isNameEditing ? (
                      <Input
                        id="document-name"
                        type="text"
                        value={currentName}
                        mt="2"
                        borderColor="border.subtle"
                        bg="bg.surface"
                        autoFocus
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                    ) : (
                      <Flex align="center" justify="space-between" gap="3" mt="2">
                        <Text fontWeight="medium" color="fg">
                          {document.name}
                        </Text>
                        <chakra.button
                          type="button"
                          aria-label="Edit display name"
                          display="inline-flex"
                          boxSize="8"
                          flexShrink={0}
                          alignItems="center"
                          justifyContent="center"
                          rounded="lg"
                          color="fg.muted"
                          transition="colors"
                          _hover={{ bg: 'bg.surface', color: 'fg' }}
                          onClick={() => setIsNameEditing(true)}
                        >
                          <Pencil size={16} />
                        </chakra.button>
                      </Flex>
                    )}
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Flex align="center" gap="2" color="fg.muted">
                      <Text>Document date</Text>
                      <InfoTooltip
                        label="More info about document date"
                        contentClassName="max-w-72"
                        content="The date the document was issued for. For example, an invoice dated 21.01.2026 has that document date even if it was uploaded on 24.04.2026."
                      />
                    </Flex>
                    {isDocumentDateEditing ? (
                      <Input
                        id="document-date"
                        type="date"
                        value={currentDocumentDate}
                        mt="2"
                        borderColor="border.subtle"
                        bg="bg.surface"
                        autoFocus
                        onChange={(event) => setDocumentDateValue(event.target.value)}
                      />
                    ) : (
                      <Flex align="center" justify="space-between" gap="3" mt="2">
                        <Text fontWeight="medium" color="fg">
                          {formatDate(document.documentDate)}
                        </Text>
                        <chakra.button
                          type="button"
                          aria-label="Edit document date"
                          display="inline-flex"
                          boxSize="8"
                          flexShrink={0}
                          alignItems="center"
                          justifyContent="center"
                          rounded="lg"
                          color="fg.muted"
                          transition="colors"
                          _hover={{ bg: 'bg.surface', color: 'fg' }}
                          onClick={() => setIsDocumentDateEditing(true)}
                        >
                          <Pencil size={16} />
                        </chakra.button>
                      </Flex>
                    )}
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Original file</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {document.originalName}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">File size</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {formatBytes(document.originalSize)}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Format</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {document.mimeType}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Uploaded by</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {document.createdBy ?? 'Unknown'}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Uploaded at</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {formatDate(document.createdAt)}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Last updated</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {formatDate(document.updatedAt)}
                    </Text>
                  </Box>
                </Flex>

                <Box rounded="lg" bg="bg.subtle" p="4" mt="4">
                  <Text color="fg.muted" mb="3">Tags</Text>
                  <Flex flexWrap="wrap" align="center" gap="2">
                    {assignedTags.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted">No tags assigned.</Text>
                    ) : null}
                    {assignedTags.map((tag) => (
                      <Flex
                        key={tag.id}
                        display="inline-flex"
                        h="8"
                        align="center"
                        gap="2"
                        rounded="full"
                        bg="bg.surface"
                        px="3"
                        fontSize="sm"
                        lineHeight="none"
                        color="fg"
                      >
                        <Box aria-hidden="true" boxSize="1.5" rounded="full" bg={tag.color ?? '#64748b'} />
                        {tag.name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${tag.name}`}
                          rounded="full"
                          color="fg.muted"
                          _hover={{ bg: 'bg.subtle', color: 'fg' }}
                          h="6"
                          w="6"
                          mr="-1"
                          onClick={() => {
                            removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </Flex>
                    ))}
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Add tag"
                          h="8"
                          w="8"
                          rounded="full"
                          bg="bg.surface"
                          color="fg.muted"
                          _hover={{ bg: 'bg.subtle', color: 'fg' }}
                        >
                          <Plus size={16} />
                        </Button>
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
                        <Box borderBottomWidth="1px" borderColor="border.subtle" p="2">
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
                              h="10"
                              borderColor="transparent"
                              px="3"
                              focusRing="none"
                              autoFocus
                            />
                          </Field>
                        </Box>
                        <Box maxH="72" overflow="auto" py="1">
                          {selectedMatchingTags.map((tag) => (
                            <DropdownMenuCheckboxItem
                              key={tag.id}
                              checked
                              onSelect={(event) => event.preventDefault()}
                              onCheckedChange={() => {
                                removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                              }}
                            >
                              <Box aria-hidden="true" boxSize="2" rounded="full" bg={tag.color ?? '#64748b'} />
                              <Text flex="1" truncate>{tag.name}</Text>
                            </DropdownMenuCheckboxItem>
                          ))}
                          {selectedMatchingTags.length > 0 && sortedFilteredAvailableTags.length > 0 ? (
                            <DropdownMenuSeparator />
                          ) : null}
                          {sortedFilteredAvailableTags.map((tag) => (
                            <DropdownMenuCheckboxItem
                              key={tag.id}
                              checked={false}
                              onSelect={(event) => event.preventDefault()}
                              onCheckedChange={() => {
                                assignTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                              }}
                            >
                              <Box aria-hidden="true" boxSize="2" rounded="full" bg={tag.color ?? '#64748b'} />
                              <Text flex="1" truncate>{tag.name}</Text>
                            </DropdownMenuCheckboxItem>
                          ))}
                          {normalizedTagSearchValue.length > 0 && !hasExactTagMatch ? (
                            <DropdownMenuItem onSelect={() => openCreateTagDialog(tagSearchValue.trim())}>
                              <Plus size={16} />
                              <Text flex="1" truncate>{`Create new tag "${tagSearchValue.trim()}"`}</Text>
                            </DropdownMenuItem>
                          ) : null}
                          {selectedMatchingTags.length === 0 && sortedFilteredAvailableTags.length === 0 ? (
                            normalizedTagSearchValue.length === 0 ? (
                              <Text px="4" py="3" fontSize="sm" color="fg.muted">
                                All tags are already assigned.
                              </Text>
                            ) : !hasExactTagMatch ? null : (
                              <Text px="4" py="3" fontSize="sm" color="fg.muted">No matching tags.</Text>
                            )
                          ) : null}
                        </Box>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Flex>
                </Box>

                {isNameEditing || isDocumentDateEditing ? (
                  <SaveButton
                    type="submit"
                    mt="5"
                    disabled={isMetadataSaving || (!hasNameChanged && !hasDocumentDateChanged)}
                  >
                    {isMetadataSaving ? 'Saving...' : 'Save changes'}
                  </SaveButton>
                ) : null}
              </chakra.form>
            ) : null}

            {activeTab === 'chat' ? (
              <ChatWorkspace
                scope={{ vaultId, documentId }}
                documentName={document.name}
                inputPlaceholder="Ask about this document..."
                heightClassName="h-full"
              />
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
                  This document will be removed from the active vault, but it is recoverable from Trash
                  until it is permanently removed manually or automatically after 30 days.
                </Text>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" disabled={deleteMutation.isPending} onClick={() => setIsDeleteDialogOpen(false)}>
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                <DeleteButton type="button" disabled={deleteMutation.isPending} onClick={() => { deleteMutation.mutate({ vaultId, documentId }); }}>
                  {deleteMutation.isPending ? 'Moving...' : 'Move to trash'}
                </DeleteButton>
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <TagDialog
        isOpen={isCreateTagDialogOpen}
        title="Create tag"
        submitLabel="Create tag"
        pendingLabel="Creating..."
        closeLabel="Close create tag dialog"
        isPending={createTagMutation.isPending || assignTagMutation.isPending}
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

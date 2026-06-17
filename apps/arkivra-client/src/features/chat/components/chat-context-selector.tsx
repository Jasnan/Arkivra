/* eslint-disable react-refresh/only-export-components */
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Box, Checkmark, CloseButton, Flex, Listbox, Stack, Text, chakra, createListCollection, useListboxItemContext, useLiveRef } from '@chakra-ui/react';
import { FileText, Lock, Paperclip, Plus, Search, Vault, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SearchFilterMultiSelect } from '@/features/documents/components/document-search-controls';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchResultItem } from '@/features/search/search.types';
import type { VaultSummary } from '@/features/vaults/vaults.types';
import type { ChatContextDocumentRef, ChatContextSnapshot, ChatContextVaultRef } from '../chat.types';

export interface DraftChatVault {
  vaultId: string;
  name?: string;
}

export interface DraftChatDocument {
  vaultId: string;
  documentId: string;
  name?: string;
  vaultName?: string;
  path?: string;
  mimeType?: string;
}

export interface DraftChatContext {
  vaults: DraftChatVault[];
  documents: DraftChatDocument[];
}

interface VaultListboxOption {
  label: string;
  value: string;
  description: string;
}

interface DocumentListboxOption {
  label: string;
  value: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  document: SearchResultItem;
}

interface ScrollToIndexDetails {
  index: number;
  getElement: () => HTMLElement | null;
  immediate?: boolean;
}

const EMPTY_DRAFT_CONTEXT: DraftChatContext = { vaults: [], documents: [] };

function optionalLabel(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function vaultKey(vault: Pick<DraftChatVault, 'vaultId'>) {
  return vault.vaultId;
}

function documentKey(document: Pick<DraftChatDocument, 'vaultId' | 'documentId'>) {
  return `${document.vaultId}:${document.documentId}`;
}

function dedupeVaults(vaults: DraftChatVault[]) {
  const seen = new Set<string>();
  const result: DraftChatVault[] = [];

  for (const vault of vaults) {
    const vaultId = vault.vaultId.trim();
    if (vaultId.length === 0 || seen.has(vaultId)) continue;
    seen.add(vaultId);
    result.push({
      vaultId,
      ...(optionalLabel(vault.name) ? { name: optionalLabel(vault.name) } : {}),
    });
  }

  return result;
}

function dedupeDocuments(documents: DraftChatDocument[], selectedVaultIds: Set<string>) {
  const seen = new Set<string>();
  const result: DraftChatDocument[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (
      vaultId.length === 0
      || documentId.length === 0
      || selectedVaultIds.has(vaultId)
      || seen.has(key)
    ) continue;
    seen.add(key);
    result.push({
      vaultId,
      documentId,
      ...(optionalLabel(document.name) ? { name: optionalLabel(document.name) } : {}),
      ...(optionalLabel(document.vaultName) ? { vaultName: optionalLabel(document.vaultName) } : {}),
      ...(optionalLabel(document.path) ? { path: optionalLabel(document.path) } : {}),
      ...(optionalLabel(document.mimeType) ? { mimeType: optionalLabel(document.mimeType) } : {}),
    });
  }

  return result;
}

export function normalizeDraftContext(context: DraftChatContext): DraftChatContext {
  const vaults = dedupeVaults(context.vaults);
  const selectedVaultIds = new Set(vaults.map(vault => vault.vaultId));

  return {
    vaults,
    documents: dedupeDocuments(context.documents, selectedVaultIds),
  };
}

export function isDocumentCoveredByVault(
  context: DraftChatContext,
  document: Pick<DraftChatDocument, 'vaultId'>,
) {
  const selectedVaultIds = new Set(normalizeDraftContext(context).vaults.map(vault => vault.vaultId));
  return selectedVaultIds.has(document.vaultId);
}

export function getEffectiveDraftDocuments(context: DraftChatContext) {
  return normalizeDraftContext(context).documents;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getDraftContextSummary(context: DraftChatContext) {
  const normalized = normalizeDraftContext(context);
  const vaultCount = normalized.vaults.length;
  const individualFileCount = normalized.documents.length;
  const itemCount = vaultCount + individualFileCount;

  let label = 'All accessible vaults';

  if (vaultCount > 0 && individualFileCount > 0) {
    label = `${pluralize(vaultCount, 'vault')} and ${pluralize(individualFileCount, 'individual file')} attached`;
  } else if (vaultCount > 0) {
    label = `${pluralize(vaultCount, 'vault')} attached`;
  } else if (individualFileCount > 0) {
    label = `${pluralize(individualFileCount, 'file')} attached`;
  }

  return {
    vaultCount,
    individualFileCount,
    itemCount,
    hasContext: itemCount > 0,
    label,
  };
}

type DocumentSelectionListItem =
  | { type: 'vault'; vaultId: string; vaultName: string; documentCount: number }
  | { type: 'document'; document: SearchResultItem };

export function groupDocumentSelectionItems(documents: SearchResultItem[]): DocumentSelectionListItem[] {
  const groups = new Map<string, { vaultId: string; vaultName: string; documents: SearchResultItem[] }>();

  for (const document of documents) {
    const group = groups.get(document.vaultId) ?? {
      vaultId: document.vaultId,
      vaultName: document.vaultName,
      documents: [],
    };

    group.documents.push(document);
    groups.set(document.vaultId, group);
  }

  return Array.from(groups.values()).flatMap(group => [
    {
      type: 'vault' as const,
      vaultId: group.vaultId,
      vaultName: group.vaultName,
      documentCount: group.documents.length,
    },
    ...group.documents.map(document => ({ type: 'document' as const, document })),
  ]);
}

export function createEmptyDraftContext(): DraftChatContext {
  return EMPTY_DRAFT_CONTEXT;
}

export function getDraftContextFromScope({
  vaultId,
  documentId,
  documentName,
}: {
  vaultId?: string;
  documentId?: string;
  documentName?: string;
}): DraftChatContext {
  if (vaultId && documentId) {
    return {
      vaults: [],
      documents: [{
        vaultId,
        documentId,
        ...(optionalLabel(documentName) ? { name: optionalLabel(documentName) } : {}),
      }],
    };
  }

  if (vaultId) {
    return { vaults: [{ vaultId }], documents: [] };
  }

  return createEmptyDraftContext();
}

export function draftContextFromSnapshot(snapshot: ChatContextSnapshot): DraftChatContext {
  if (snapshot.type === 'selection') {
    return normalizeDraftContext({
      vaults: snapshot.vaults.map(vault => ({
        vaultId: vault.vaultId,
        name: vault.name,
      })),
      documents: snapshot.documents.map(document => ({
        vaultId: document.vaultId,
        documentId: document.documentId,
        name: document.name,
        vaultName: document.vaultName,
        path: document.path,
      })),
    });
  }

  if (snapshot.type === 'document') {
    return {
      vaults: [],
      documents: [{
        vaultId: snapshot.vaultId,
        documentId: snapshot.documentId,
        name: snapshot.documentName,
        vaultName: snapshot.vaultName,
      }],
    };
  }

  if (snapshot.type === 'vault') {
    return {
      vaults: [{ vaultId: snapshot.vaultId, name: snapshot.vaultName }],
      documents: [],
    };
  }

  return {
    vaults: snapshot.vaultIds.map(vaultId => ({ vaultId })),
    documents: [],
  };
}

export function hydrateDraftContextLabels({
  context,
  vaults,
}: {
  context: DraftChatContext;
  vaults: VaultSummary[];
}): DraftChatContext {
  const vaultNameById = new Map(vaults.map(vault => [vault.id, vault.name]));

  return normalizeDraftContext({
    vaults: context.vaults.map(vault => ({
      ...vault,
      name: vault.name ?? vaultNameById.get(vault.vaultId),
    })),
    documents: context.documents.map(document => ({
      ...document,
      vaultName: document.vaultName ?? vaultNameById.get(document.vaultId),
    })),
  });
}

export function contextSnapshotFromDraft(context: DraftChatContext): ChatContextSnapshot {
  const normalized = normalizeDraftContext(context);

  if (normalized.vaults.length === 0 && normalized.documents.length === 0) {
    return { type: 'global', vaultIds: [] };
  }

  if (normalized.vaults.length === 1 && normalized.documents.length === 0) {
    const [vault] = normalized.vaults;
    return {
      type: 'vault',
      vaultId: vault.vaultId,
      ...(vault.name ? { vaultName: vault.name } : {}),
    };
  }

  if (normalized.vaults.length === 0 && normalized.documents.length === 1) {
    const [document] = normalized.documents;
    return {
      type: 'document',
      vaultId: document.vaultId,
      documentId: document.documentId,
      ...(document.vaultName ? { vaultName: document.vaultName } : {}),
      ...(document.name ? { documentName: document.name } : {}),
    };
  }

  return {
    type: 'selection',
    vaults: normalized.vaults.map((vault): ChatContextVaultRef => ({
      vaultId: vault.vaultId,
      ...(vault.name ? { name: vault.name } : {}),
    })),
    documents: normalized.documents.map((document): ChatContextDocumentRef => ({
      vaultId: document.vaultId,
      documentId: document.documentId,
      ...(document.name ? { name: document.name } : {}),
      ...(document.vaultName ? { vaultName: document.vaultName } : {}),
      ...(document.path ? { path: document.path } : {}),
    })),
  };
}

export function addVaultsToDraftContext(context: DraftChatContext, vaults: DraftChatVault[]): DraftChatContext {
  return normalizeDraftContext({
    vaults: [...context.vaults, ...vaults],
    documents: context.documents,
  });
}

export function addDocumentsToDraftContext(context: DraftChatContext, documents: DraftChatDocument[]): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: [...context.documents, ...documents],
  });
}

export function removeVaultFromDraftContext(context: DraftChatContext, vaultId: string): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults.filter(vault => vault.vaultId !== vaultId),
    documents: context.documents,
  });
}

export function removeDocumentFromDraftContext(context: DraftChatContext, document: Pick<DraftChatDocument, 'vaultId' | 'documentId'>): DraftChatContext {
  const key = documentKey(document);
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: context.documents.filter(item => documentKey(item) !== key),
  });
}

export function isDraftContextEmpty(context: DraftChatContext) {
  return context.vaults.length === 0 && context.documents.length === 0;
}

export function ChatContextAddMenu({
  disabled,
  onAddVaults,
  onAddDocuments,
}: {
  disabled?: boolean;
  onAddVaults: () => void;
  onAddDocuments: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add vaults and documents into context"
          title="Add vaults and documents into context"
          disabled={disabled}
          flexShrink="0"
          style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem' }}
        >
          <Paperclip size={17} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem value="add-vaults" onSelect={onAddVaults}>
          <Vault size={16} />
          Add vaults
        </DropdownMenuItem>
        <DropdownMenuItem value="add-documents" onSelect={onAddDocuments}>
          <FileText size={16} />
          Add files
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContextChipList({
  context,
  locked,
  disabled,
  onRemoveVault,
  onRemoveDocument,
}: {
  context: DraftChatContext;
  locked: boolean;
  disabled?: boolean;
  onRemoveVault: (vault: DraftChatVault) => void;
  onRemoveDocument: (document: DraftChatDocument) => void;
}) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const normalized = normalizeDraftContext(context);
  const summary = getDraftContextSummary(normalized);

  useEffect(() => {
    if (disabled) setIsDetailsOpen(false);
  }, [disabled]);

  return (
    <>
      <Flex
        align="center"
        gap="2"
        minW="0"
        pb="2"
        color="fg.muted"
        aria-label="Active conversation context"
      >
        <Text as="span" flexShrink="0" fontSize="xs" fontWeight="semibold">
          Context:
        </Text>
        {locked ? <Lock size={13} style={{ flexShrink: 0 }} /> : null}
        <Text as="span" minW="0" truncate fontSize="xs" fontWeight="medium">
          {summary.label}
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          flexShrink="0"
          h="7"
          minH="7"
          px="2"
          color="fg.muted"
          fontSize="xs"
          disabled={disabled}
          onClick={() => setIsDetailsOpen(true)}
        >
          View all
        </Button>
      </Flex>
      <ContextDetailsDialog
        open={isDetailsOpen}
        context={normalized}
        locked={locked}
        onOpenChange={setIsDetailsOpen}
        onRemoveVault={onRemoveVault}
        onRemoveDocument={onRemoveDocument}
      />
    </>
  );
}

function ContextDetailsDialog({
  open,
  context,
  locked,
  onOpenChange,
  onRemoveVault,
  onRemoveDocument,
}: {
  open: boolean;
  context: DraftChatContext;
  locked: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveVault: (vault: DraftChatVault) => void;
  onRemoveDocument: (document: DraftChatDocument) => void;
}) {
  const normalized = normalizeDraftContext(context);
  const summary = getDraftContextSummary(normalized);

  function removeVault(vault: DraftChatVault) {
    onRemoveVault(vault);
    if (!locked) onOpenChange(false);
  }

  function removeDocument(document: DraftChatDocument) {
    onRemoveDocument(document);
    if (!locked) onOpenChange(false);
  }

  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="3"
            right="3"
            aria-label="Close context details"
          />
        </DialogClose>
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Conversation Context</DialogTitle>
          <DialogDescription>
            {locked ? `Context locked: ${summary.label}` : summary.label}
          </DialogDescription>
        </DialogHeader>
        <DialogBody asChild>
          <Stack gap="4" px="5" pb="5">
            {summary.hasContext ? (
              <>
                <ContextDetailsSection title="Vaults" emptyLabel="No vaults attached.">
                  {normalized.vaults.map(vault => (
                    <ContextDetailsRow
                      key={vaultKey(vault)}
                      icon={<Vault size={16} />}
                      label={vault.name ?? vault.vaultId}
                      removeLabel={`Remove ${vault.name ?? vault.vaultId} from context`}
                      onRemove={() => removeVault(vault)}
                    />
                  ))}
                </ContextDetailsSection>
                <ContextDetailsSection title="Individual files" emptyLabel="No individual files attached.">
                  {normalized.documents.map(document => (
                    <ContextDetailsRow
                      key={documentKey(document)}
                      icon={<FileText size={16} />}
                      label={document.name ?? document.documentId}
                      detail={document.vaultName}
                      removeLabel={`Remove ${document.name ?? document.documentId} from context`}
                      onRemove={() => removeDocument(document)}
                    />
                  ))}
                </ContextDetailsSection>
              </>
            ) : (
              <Flex
                align="center"
                gap="3"
                rounded="md"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.subtle"
                px="3"
                py="3"
              >
                <Vault size={17} />
                <Text fontSize="sm" color="fg.muted">All accessible vaults</Text>
              </Flex>
            )}
          </Stack>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ContextDetailsSection({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <Box>
      <Text mb="2" fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
        {title}
      </Text>
      <Stack gap="1.5">
        {hasChildren ? children : (
          <Text rounded="md" bg="bg.subtle" px="3" py="2.5" fontSize="sm" color="fg.muted">
            {emptyLabel}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

function ContextDetailsRow({
  icon,
  label,
  detail,
  removeLabel,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <Flex
      align="center"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="3"
      py="2.5"
    >
      <Box color="fg.muted" flexShrink="0">
        {icon}
      </Box>
      <Box minW="0" flex="1">
        <Text truncate fontSize="sm" fontWeight="medium" color="fg">
          {label}
        </Text>
        {detail ? (
          <Text truncate fontSize="xs" color="fg.muted">
            {detail}
          </Text>
        ) : null}
      </Box>
      <chakra.button
        type="button"
        aria-label={removeLabel}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        rounded="full"
        color="fg.muted"
        cursor="pointer"
        p="1.5"
        _hover={{ bg: 'bg.subtle', color: 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
        onClick={onRemove}
      >
        <X size={15} />
      </chakra.button>
    </Flex>
  );
}

export function VaultSelectionDialog({
  open,
  context,
  vaults,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  context: DraftChatContext;
  vaults: VaultSummary[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (vaults: DraftChatVault[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const availableVaults = useMemo(
    () => vaults.filter(vault => vault.aiAccessLevel === 'full'),
    [vaults],
  );
  const filteredVaults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return availableVaults;
    return availableVaults.filter(vault =>
      vault.name.toLowerCase().includes(normalizedQuery)
      || vault.description?.toLowerCase().includes(normalizedQuery),
    );
  }, [availableVaults, query]);
  const vaultOptions = useMemo<VaultListboxOption[]>(
    () => filteredVaults.map(vault => ({
      label: vault.name,
      value: vault.id,
      description: vault.description?.trim() || 'No description added.',
    })),
    [filteredVaults],
  );
  const vaultCollection = useMemo(
    () => createListCollection({ items: vaultOptions }),
    [vaultOptions],
  );
  const vaultListVirtualizer = useListboxVirtualizer({
    count: vaultCollection.items.length,
    estimateSize: 60,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(context.vaults.map(vault => vault.vaultId)));
    setQuery('');
  }, [context.vaults, open]);

  function confirm() {
    const selectedVaults = availableVaults
      .filter(vault => selectedIds.has(vault.id))
      .map(vault => ({ vaultId: vault.id, name: vault.name }));
    onConfirm(selectedVaults);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton maxW="40rem" w="calc(100vw - 2rem)" bg="bg.modalHeader" p="0" rounded="xl" shadow="lg">
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="5"
            right="5"
            rounded="lg"
            color="fg.muted"
            aria-label="Close add vaults dialog"
            _hover={{ bg: 'bg.modalField', color: 'fg' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
          />
        </DialogClose>
        <Box
          borderBottomWidth="1px"
          borderColor="border.divider"
          bg="bg.modalHeader"
          px={{ base: '5', sm: '6' }}
          py={{ base: '4.5', sm: '5' }}
          pr={{ base: '14', lg: '16' }}
        >
          <DialogHeader p="0">
            <Flex gap="3" align="center">
              <Flex boxSize="10" align="center" justify="center" rounded="lg" bg="bg.subtle" color="fg.muted" flexShrink="0">
                <Vault size={18} />
              </Flex>
              <Stack gap="0.5" minW="0">
                <DialogTitle fontSize="lg" lineHeight="1.25">Add Vaults</DialogTitle>
                <DialogDescription>Only vaults with full AI access are shown.</DialogDescription>
              </Stack>
            </Flex>
          </DialogHeader>
        </Box>
        <DialogBody asChild>
          <Stack gap="3" px={{ base: '5', sm: '6' }} py={{ base: '5', sm: '6' }} bg="bg.modalContent">
            <Listbox.Root
              collection={vaultCollection}
              value={Array.from(selectedIds)}
              selectionMode="multiple"
              colorPalette="teal"
              scrollToIndexFn={vaultListVirtualizer.scrollToIndexFn}
              onValueChange={(details) => setSelectedIds(new Set(details.value))}
            >
              <Box position="relative">
                <Box
                  position="absolute"
                  left="3"
                  top="50%"
                  transform="translateY(-50%)"
                  color="fg.muted"
                  pointerEvents="none"
                  zIndex="1"
                >
                  <Search size={16} />
                </Box>
                <Listbox.Input
                  as={Input}
                  aria-label="Search vaults"
                  value={query}
                  placeholder="Search vaults"
                  pl="9"
                  rounded="md"
                  bg="bg.modalField"
                  borderColor="border.surface"
                  fontSize="sm"
                  fontWeight="medium"
                  _hover={{ borderColor: 'border.strong' }}
                  _focusVisible={{ borderColor: 'teal.solid', boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)' }}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Box>
              <Listbox.Content
                ref={vaultListVirtualizer.scrollRef}
                h="22rem"
                maxH="22rem"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.modalField"
                overflowY="auto"
                p="2"
              >
                {vaultCollection.items.length === 0 ? (
                  <Listbox.Empty>
                    <Flex h="full" minH="18rem" align="center" justify="center" px="6" textAlign="center" color="fg.muted">
                      <Text fontSize="sm">No vaults found.</Text>
                    </Flex>
                  </Listbox.Empty>
                ) : (
                  <Box {...vaultListVirtualizer.getViewportProps()}>
                    {vaultListVirtualizer.virtualItems.map((virtualItem) => {
                      const vault = vaultCollection.items[virtualItem.index];
                      if (!vault) return null;

                      return (
                        <Box
                          key={vault.value}
                          {...vaultListVirtualizer.getItemProps({ virtualItem })}
                        >
                          <Listbox.Item
                            item={vault}
                            display="flex"
                            h="60px"
                            minH="60px"
                            alignItems="center"
                            gap="2.5"
                            rounded="md"
                            px="3"
                            py="1.5"
                            cursor="pointer"
                            _hover={{ bg: 'bg.subtle' }}
                            _highlighted={{ bg: 'bg.subtle' }}
                            _selected={{ bg: 'teal.subtle' }}
                            css={{
                              '&[data-highlighted][data-selected], &[data-selected], &[data-selected]:hover': {
                                background: 'var(--chakra-colors-teal-subtle)',
                              },
                            }}
                          >
                            <Box flexShrink="0">
                              <ListboxItemCheckmark />
                            </Box>
                            <Box minW="0" flex="1">
                              <Listbox.ItemText>
                                <Text truncate fontSize="sm" fontWeight="semibold" lineHeight="1.35" color="fg">
                                  {vault.label}
                                </Text>
                              </Listbox.ItemText>
                              <Text mt="0.5" truncate fontSize="xs" lineHeight="1.3" color="fg.muted">
                                {vault.description}
                              </Text>
                            </Box>
                          </Listbox.Item>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Listbox.Content>
            </Listbox.Root>
          </Stack>
        </DialogBody>
        <Box
          borderTopWidth="1px"
          borderColor="border.divider"
          bg="bg.modalFooter"
          px={{ base: '5', sm: '6' }}
          py={{ base: '4', sm: '4.5' }}
        >
          <Flex align="center" justify="space-between" gap="4" w="full">
            <Button
              type="button"
              variant="outline"
              size="lg"
              rounded="lg"
              borderColor="border.strong"
              bg="transparent"
              _hover={{ bg: 'bg.modalField', borderColor: 'fg/30' }}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="lg" rounded="lg" colorPalette="teal" onClick={confirm}>
              <Plus size={18} />
              Add
            </Button>
          </Flex>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function ListboxItemCheckmark() {
  const itemState = useListboxItemContext();

  return (
    <Checkmark
      filled
      colorPalette="teal"
      size="sm"
      checked={itemState.selected}
      disabled={itemState.disabled}
      flexShrink="0"
    />
  );
}

function useListboxVirtualizer({
  count,
  estimateSize,
}: {
  count: number;
  estimateSize: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearScrollTimeout() {
    if (scrollTimeoutRef.current === null) return;
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = null;
  }

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
    initialRect: {
      height: 352,
      width: 576,
    },
  });
  const virtualizerRef = useLiveRef(virtualizer);
  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  function scrollToIndexFn(details: ScrollToIndexDetails) {
    clearScrollTimeout();

    function scrollToIndex() {
      const currentVirtualizer = virtualizerRef.current;
      const virtualItem = currentVirtualizer.getVirtualItems().find(item => item.index === details.index);

      if (virtualItem) {
        details.getElement()?.scrollIntoView({ block: 'nearest' });
        clearScrollTimeout();
        return;
      }

      currentVirtualizer.scrollToIndex(details.index);

      if (!details.immediate) {
        scrollTimeoutRef.current = setTimeout(scrollToIndex, 16);
      }
    }

    scrollToIndex();
  }

  useEffect(() => clearScrollTimeout, []);

  return {
    scrollRef,
    scrollToIndexFn,
    virtualItems: virtualItems.length > 0
      ? virtualItems
      : getFallbackListboxVirtualItems({ count, estimateSize }),
    getViewportProps(
      props: ComponentProps<'div'> = {},
    ): ComponentProps<'div'> {
      return {
        ...props,
        style: {
          ...props.style,
          height: `${totalSize}px`,
          position: 'relative',
          width: '100%',
        },
      };
    },
    getItemProps(
      props: ComponentProps<'div'> & { virtualItem: VirtualItem },
    ): ComponentProps<'div'> {
      const { virtualItem, ...rest } = props;

      return {
        ...rest,
        'aria-posinset': virtualItem.index + 1,
        'aria-setsize': count,
        style: {
          ...rest.style,
          height: `${virtualItem.size}px`,
          left: 0,
          overflow: 'hidden',
          position: 'absolute',
          top: 0,
          transform: `translateY(${virtualItem.start}px)`,
          width: '100%',
        },
      };
    },
  };
}

function getFallbackListboxVirtualItems({
  count,
  estimateSize,
}: {
  count: number;
  estimateSize: number;
}): VirtualItem[] {
  return Array.from({ length: Math.min(count, 12) }, (_, index): VirtualItem => ({
    end: (index + 1) * estimateSize,
    index,
    key: index,
    lane: 0,
    size: estimateSize,
    start: index * estimateSize,
  }));
}

export function DocumentSelectionDialog({
  open,
  context,
  vaults,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  context: DraftChatContext;
  vaults: VaultSummary[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (documents: DraftChatDocument[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedFilterVaultIds, setSelectedFilterVaultIds] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, DraftChatDocument>>(() => new Map());
  const selectableVaults = useMemo(
    () => vaults.filter(vault => vault.aiAccessLevel === 'full'),
    [vaults],
  );
  const effectiveVaultIds = selectedFilterVaultIds.length === 0
    ? selectableVaults.map(vault => vault.id)
    : selectedFilterVaultIds;
  const selectedFilterVaults = useMemo(
    () => selectableVaults.filter(vault => selectedFilterVaultIds.includes(vault.id)),
    [selectableVaults, selectedFilterVaultIds],
  );
  const selectedFilterVaultsLabel = useMemo(() => {
    if (selectedFilterVaults.length === 0) return 'All vaults';
    if (selectedFilterVaults.length <= 2) return selectedFilterVaults.map(vault => vault.name).join(', ');
    return `${selectedFilterVaults[0].name}, ${selectedFilterVaults[1].name} +${selectedFilterVaults.length - 2}`;
  }, [selectedFilterVaults]);
  const documentQuery = useGlobalSearchDocumentsQuery({
    query,
    pageIndex: 0,
    pageSize: 100,
    vaultIds: effectiveVaultIds,
    sortBy: 'name_asc',
    enabled: open && effectiveVaultIds.length > 0,
  });
  const selectedVaultById = useMemo(
    () => new Map(normalizeDraftContext(context).vaults.map(vault => [vault.vaultId, vault])),
    [context],
  );
  const documentOptions = useMemo<DocumentListboxOption[]>(
    () => (documentQuery.data?.results ?? []).map((document) => {
      const selectedVault = selectedVaultById.get(document.vaultId);
      const disabledReason = selectedVault
        ? `Already included via ${selectedVault.name ?? document.vaultName}`
        : undefined;

      return {
        label: document.name,
        value: documentKey(document),
        description: document.vaultName,
        disabled: Boolean(disabledReason),
        disabledReason,
        document,
      };
    }),
    [documentQuery.data?.results, selectedVaultById],
  );
  const documentCollection = useMemo(
    () => createListCollection({ items: documentOptions }),
    [documentOptions],
  );
  const documentListVirtualizer = useListboxVirtualizer({
    count: documentCollection.items.length,
    estimateSize: 60,
  });
  const selectedDocumentCount = selectedDocuments.size;
  const selectedDocumentLabel = selectedDocumentCount === 1
    ? '1 document selected'
    : `${selectedDocumentCount} documents selected`;

  useEffect(() => {
    if (!open) return;
    setSelectedDocuments(new Map(context.documents.map(document => [documentKey(document), document])));
    setQuery('');
    setSelectedFilterVaultIds([]);
  }, [context.documents, open]);

  function handleDocumentValueChange(details: { value: string[]; items: DocumentListboxOption[] }) {
    const visibleKeys = new Set(documentOptions.map(option => option.value));
    const nextSelectedKeys = new Set(details.value);

    setSelectedDocuments((current) => {
      const next = new Map(current);

      for (const key of visibleKeys) {
        if (!nextSelectedKeys.has(key)) {
          next.delete(key);
        }
      }

      for (const item of details.items) {
        if (item.disabled) continue;
        const document = item.document;
        next.set(item.value, {
          vaultId: document.vaultId,
          documentId: document.documentId,
          name: document.name,
          vaultName: document.vaultName,
          path: document.vaultName,
          mimeType: document.mimeType,
        });
      }

      return next;
    });
  }

  function confirm() {
    onConfirm([...selectedDocuments.values()]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton maxW="40rem" w="calc(100vw - 2rem)" bg="bg.modalHeader" p="0" rounded="xl" shadow="lg">
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="5"
            right="5"
            rounded="lg"
            color="fg.muted"
            aria-label="Close add documents dialog"
            _hover={{ bg: 'bg.modalField', color: 'fg' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
          />
        </DialogClose>
        <Box
          borderBottomWidth="1px"
          borderColor="border.divider"
          bg="bg.modalHeader"
          px={{ base: '5', sm: '6' }}
          py={{ base: '4.5', sm: '5' }}
          pr={{ base: '14', lg: '16' }}
        >
          <DialogHeader p="0">
            <Flex gap="3" align="center">
              <Flex boxSize="10" align="center" justify="center" rounded="lg" bg="bg.subtle" color="fg.muted" flexShrink="0">
                <FileText size={18} />
              </Flex>
              <Stack gap="0.5" minW="0">
                <DialogTitle fontSize="lg" lineHeight="1.25">Add Documents</DialogTitle>
                <DialogDescription>Only indexed documents from vaults with AI access are shown.</DialogDescription>
              </Stack>
            </Flex>
          </DialogHeader>
        </Box>
        <DialogBody asChild>
          <Stack gap="3" px={{ base: '5', sm: '6' }} py={{ base: '5', sm: '6' }} bg="bg.modalContent">
            <Listbox.Root
              collection={documentCollection}
              value={Array.from(selectedDocuments.keys())}
              selectionMode="multiple"
              colorPalette="teal"
              scrollToIndexFn={documentListVirtualizer.scrollToIndexFn}
              onValueChange={handleDocumentValueChange}
            >
              <Flex gap="2" direction={{ base: 'column', sm: 'row' }}>
                <Box position="relative" flex="1">
                  <Box
                    position="absolute"
                    left="3"
                    top="50%"
                    transform="translateY(-50%)"
                    color="fg.muted"
                    pointerEvents="none"
                    zIndex="1"
                  >
                    <Search size={16} />
                  </Box>
                  <Listbox.Input
                    as={Input}
                    aria-label="Search documents"
                    value={query}
                    placeholder="Search documents"
                    pl="9"
                    rounded="md"
                    bg="bg.modalField"
                    borderColor="border.surface"
                    fontSize="sm"
                    fontWeight="medium"
                    _hover={{ borderColor: 'border.strong' }}
                    _focusVisible={{ borderColor: 'teal.solid', boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)' }}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </Box>
                <Box w={{ base: 'full', sm: '14rem' }}>
                  <SearchFilterMultiSelect
                    label="Vaults"
                    triggerLabel={selectedFilterVaultsLabel}
                    triggerAriaLabel="Vault filter"
                    searchLabel="Search vaults"
                    searchPlaceholder="Search vaults"
                    emptyLabel="No vaults found."
                    loadingLabel="Loading vaults..."
                    options={selectableVaults.map(vault => ({
                      value: vault.id,
                      label: vault.name,
                    }))}
                    selectedValues={selectedFilterVaultIds}
                    onValueChange={setSelectedFilterVaultIds}
                    onClear={() => setSelectedFilterVaultIds([])}
                    hideLabel
                    controlSize="toolbar"
                    controlBg="bg.modalField"
                    contentBg="bg.modalField"
                  />
                </Box>
              </Flex>

              <Listbox.Content
                ref={documentListVirtualizer.scrollRef}
                h="24rem"
                maxH="24rem"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.modalField"
                overflowY="auto"
                p="2"
              >
                {documentQuery.isLoading ? (
                  <Flex h="full" minH="20rem" align="center" justify="center" px="6" color="fg.muted">
                    <Text fontSize="sm">Loading documents...</Text>
                  </Flex>
                ) : documentCollection.items.length === 0 ? (
                  <Listbox.Empty>
                    <Flex h="full" minH="20rem" align="center" justify="center" px="6" textAlign="center" color="fg.muted">
                      <Text fontSize="sm">No documents found.</Text>
                    </Flex>
                  </Listbox.Empty>
                ) : (
                  <Box {...documentListVirtualizer.getViewportProps()}>
                    {documentListVirtualizer.virtualItems.map((virtualItem) => {
                      const item = documentCollection.items[virtualItem.index];
                      if (!item) return null;

                      return (
                        <Box
                          key={item.value}
                          {...documentListVirtualizer.getItemProps({ virtualItem })}
                        >
                          <Listbox.Item
                            item={item}
                            display="flex"
                            h="60px"
                            minH="60px"
                            alignItems="center"
                            gap="2.5"
                            rounded="md"
                            px="3"
                            py="1.5"
                            cursor={item.disabled ? 'not-allowed' : 'pointer'}
                            opacity="1"
                            _hover={{ bg: item.disabled ? undefined : 'bg.subtle' }}
                            _highlighted={{ bg: item.disabled ? undefined : 'bg.subtle' }}
                            _selected={{ bg: 'teal.subtle' }}
                            _disabled={{ color: 'fg.muted' }}
                            css={{
                              '&[data-highlighted][data-selected], &[data-selected], &[data-selected]:hover': {
                                background: 'var(--chakra-colors-teal-subtle)',
                              },
                            }}
                          >
                            <Box flexShrink="0">
                              <ListboxItemCheckmark />
                            </Box>
                            <Box minW="0" flex="1">
                              <Listbox.ItemText>
                                <Text truncate fontSize="sm" fontWeight="semibold" lineHeight="1.35" color={item.disabled ? 'fg.muted' : 'fg'}>
                                  {item.label}
                                </Text>
                              </Listbox.ItemText>
                              <Text mt="0.5" truncate fontSize="xs" lineHeight="1.3" color="fg.muted">
                                {item.description}
                              </Text>
                              {item.disabledReason ? (
                                <Text mt="0.5" truncate fontSize="xs" lineHeight="1.3" color="fg.muted">
                                  {item.disabledReason}
                                </Text>
                              ) : null}
                            </Box>
                          </Listbox.Item>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Listbox.Content>
            </Listbox.Root>
          </Stack>
        </DialogBody>
        <Box
          borderTopWidth="1px"
          borderColor="border.divider"
          bg="bg.modalFooter"
          px={{ base: '5', sm: '6' }}
          py={{ base: '4', sm: '4.5' }}
        >
          <Flex align="center" justify="space-between" gap="4" w="full">
            <Flex align="center" gap="4" minW="0">
              <Button
                type="button"
                variant="outline"
                size="lg"
                rounded="lg"
                borderColor="border.strong"
                bg="transparent"
                _hover={{ bg: 'bg.modalField', borderColor: 'fg/30' }}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {selectedDocumentCount > 0 ? (
                <Flex align="center" gap="2" minW="0">
                  <Text truncate fontSize="sm" color="fg.muted">
                    {selectedDocumentLabel}
                  </Text>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    rounded="md"
                    color="fg.muted"
                    _hover={{ bg: 'bg.modalField', color: 'fg' }}
                    onClick={() => setSelectedDocuments(new Map())}
                  >
                    Clear
                  </Button>
                </Flex>
              ) : null}
            </Flex>
            <Button type="button" size="lg" rounded="lg" colorPalette="teal" onClick={confirm}>
              <Plus size={18} />
              Add
            </Button>
          </Flex>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export function ConversationForkDialog({
  open,
  isPending,
  currentContext,
  nextContext,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  isPending?: boolean;
  currentContext: DraftChatContext;
  nextContext: DraftChatContext;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="3"
            right="3"
            aria-label="Close context change dialog"
          />
        </DialogClose>
        <DialogHeader style={{ padding: '1.25rem 3.5rem 0.75rem 1.25rem' }}>
          <DialogTitle>Start a new conversation with updated context?</DialogTitle>
          <DialogDescription>
            Conversations preserve their original document and vault context to keep references, retrieval results, and answers consistent over time.
          </DialogDescription>
        </DialogHeader>
        <DialogBody asChild>
          <Stack gap="4" px="5" pb="4">
            <Stack gap="2" color="fg.muted" fontSize="sm" lineHeight="1.55">
              <Text>
                Adding or removing documents or vaults creates a new conversation with the updated context.
              </Text>
              <Text>
                Your current conversation will remain unchanged.
              </Text>
            </Stack>
            <ConversationContextPreview
              title="Current Conversation Context"
              context={currentContext}
            />
            <ConversationContextPreview
              title="New Conversation Context"
              context={nextContext}
              emphasized
            />
          </Stack>
        </DialogBody>
        <DialogFooter style={{ padding: '0 1.25rem 1.25rem' }}>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={onConfirm}>
            New conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationContextPreview({
  title,
  context,
  emphasized,
}: {
  title: string;
  context: DraftChatContext;
  emphasized?: boolean;
}) {
  const normalized = normalizeDraftContext(context);
  const hasContext = !isDraftContextEmpty(normalized);

  return (
    <Box
      rounded="lg"
      borderWidth="1px"
      borderColor={emphasized ? 'teal.muted' : 'border.surface'}
      bg={emphasized ? 'teal.subtle' : 'bg.subtle'}
      px="3.5"
      py="3"
    >
      <Text mb="2" fontSize="xs" fontWeight="semibold" color="fg.muted">
        {title}
      </Text>
      <Flex
        role="list"
        aria-label={title}
        maxH="7.5rem"
        overflowY="auto"
        gap="2"
        flexWrap="wrap"
        pr="1"
      >
        {hasContext ? (
          <>
            {normalized.vaults.map(vault => (
              <ContextPreviewChip
                key={vaultKey(vault)}
                icon={<Vault size={14} />}
                label={vault.name ?? vault.vaultId}
                typeLabel="Vault"
              />
            ))}
            {normalized.documents.map(document => (
              <ContextPreviewChip
                key={documentKey(document)}
                icon={<FileText size={14} />}
                label={document.name ?? document.documentId}
                detail={document.vaultName}
                typeLabel="Document"
              />
            ))}
          </>
        ) : (
          <ContextPreviewChip
            icon={<Vault size={14} />}
            label="All accessible vaults"
            typeLabel="Global context"
          />
        )}
      </Flex>
    </Box>
  );
}

function ContextPreviewChip({
  icon,
  label,
  detail,
  typeLabel,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  typeLabel: string;
}) {
  const accessibleLabel = detail ? `${typeLabel}: ${label}, ${detail}` : `${typeLabel}: ${label}`;

  return (
    <Flex
      role="listitem"
      aria-label={accessibleLabel}
      align="center"
      gap="1.5"
      minW="0"
      maxW="100%"
      rounded="full"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="2.5"
      py="1.5"
      color="fg"
      fontSize="xs"
      fontWeight="medium"
    >
      <Box as="span" color="fg.muted" flexShrink="0">
        {icon}
      </Box>
      <Text as="span" minW="0" truncate>
        {label}
      </Text>
      {detail ? (
        <Text as="span" display={{ base: 'none', sm: 'inline' }} color="fg.muted" truncate>
          {detail}
        </Text>
      ) : null}
    </Flex>
  );
}

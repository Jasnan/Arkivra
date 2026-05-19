/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Box, Checkbox as ChakraCheckbox, CloseButton, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, FileText, Folder, Lock, Paperclip, Search, Vault, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDocumentFileIconMeta } from '@/features/documents/components/document-file-icon.utils';
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

function dedupeDocuments(documents: DraftChatDocument[]) {
  const seen = new Set<string>();
  const result: DraftChatDocument[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (vaultId.length === 0 || documentId.length === 0 || seen.has(key)) continue;
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
  return {
    vaults: dedupeVaults(context.vaults),
    documents: dedupeDocuments(context.documents),
  };
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
          Add Vaults
        </DropdownMenuItem>
        <DropdownMenuItem value="add-documents" onSelect={onAddDocuments}>
          <FileText size={16} />
          Add Documents
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContextChipList({
  context,
  locked,
  onRemoveVault,
  onRemoveDocument,
}: {
  context: DraftChatContext;
  locked: boolean;
  onRemoveVault: (vault: DraftChatVault) => void;
  onRemoveDocument: (document: DraftChatDocument) => void;
}) {
  const normalized = normalizeDraftContext(context);
  const hasContext = !isDraftContextEmpty(normalized);

  if (!hasContext) {
    return null;
  }

  return (
    <Flex align="center" gap="2" flexWrap="wrap" pb="2">
      <Text as="span" flexShrink="0" fontSize="xs" fontWeight="semibold" color="fg.muted">
        {locked ? 'Chatting Across:' : 'Context:'}
      </Text>
      {normalized.vaults.map(vault => (
        <ContextChip
          key={vaultKey(vault)}
          icon={<Vault size={14} />}
          label={vault.name ?? vault.vaultId}
          locked={locked}
          removeLabel={`Remove ${vault.name ?? vault.vaultId} from context`}
          onRemove={() => onRemoveVault(vault)}
        />
      ))}
      {normalized.documents.map(document => (
        <ContextChip
          key={documentKey(document)}
          icon={<FileText size={14} />}
          label={document.name ?? document.documentId}
          detail={document.vaultName}
          locked={locked}
          removeLabel={`Remove ${document.name ?? document.documentId} from context`}
          onRemove={() => onRemoveDocument(document)}
        />
      ))}
    </Flex>
  );
}

function ContextChip({
  icon,
  label,
  detail,
  locked,
  removeLabel,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  locked: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <Flex
      as="span"
      align="center"
      gap="1.5"
      maxW="18rem"
      rounded="full"
      borderWidth="1px"
      borderColor={locked ? 'border.strong' : 'border.surface'}
      bg={locked ? 'bg.subtle' : 'bg.surface'}
      px="2.5"
      py="1.5"
      color="fg"
      fontSize="xs"
      fontWeight="medium"
    >
      <Box as="span" color={locked ? 'fg.muted' : 'teal.fg'} flexShrink="0">
        {icon}
      </Box>
      {locked ? (
        <Box as="span" color="fg.muted" flexShrink="0">
          <Lock size={12} />
        </Box>
      ) : null}
      <Text as="span" minW="0" truncate>
        {label}
      </Text>
      {detail ? (
        <Text as="span" display={{ base: 'none', sm: 'inline' }} color="fg.muted" truncate>
          {detail}
        </Text>
      ) : null}
      <chakra.button
        type="button"
        aria-label={removeLabel}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        rounded="full"
        color="fg.muted"
        cursor="pointer"
        _hover={{ bg: 'bg.muted', color: 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
        onClick={onRemove}
      >
        <X size={13} />
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(context.vaults.map(vault => vault.vaultId)));
    setQuery('');
  }, [context.vaults, open]);

  function toggleVault(vaultId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(vaultId)) next.delete(vaultId);
      else next.add(vaultId);
      return next;
    });
  }

  function confirm() {
    const selectedVaults = availableVaults
      .filter(vault => selectedIds.has(vault.id))
      .map(vault => ({ vaultId: vault.id, name: vault.name }));
    onConfirm(selectedVaults);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="42rem">
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Add Vaults</DialogTitle>
          <DialogDescription>Select vaults with full AI access.</DialogDescription>
        </DialogHeader>
        <Box px="5" pb="4">
          <Flex align="center" gap="2" mb="3">
            <Search size={16} color="var(--chakra-colors-fg-muted)" />
            <Input
              aria-label="Search vaults"
              value={query}
              placeholder="Search vaults"
              onChange={(event) => setQuery(event.target.value)}
            />
          </Flex>
          <Box h="22rem" rounded="lg" borderWidth="1px" borderColor="border.surface" overflow="hidden">
            {filteredVaults.length === 0 ? (
              <Flex h="full" align="center" justify="center" px="6" textAlign="center" color="fg.muted">
                <Text fontSize="sm">No vaults found.</Text>
              </Flex>
            ) : (
              <Virtuoso
                style={{ height: '100%' }}
                data={filteredVaults}
                initialItemCount={Math.min(filteredVaults.length, 24)}
                itemContent={(_, vault) => (
                  <Box px="2" py="1.5">
                    <VaultSelectionRow
                      vault={vault}
                      selected={selectedIds.has(vault.id)}
                      onToggle={() => toggleVault(vault.id)}
                    />
                  </Box>
                )}
              />
            )}
          </Box>
        </Box>
        <DialogFooter style={{ padding: '0 1.25rem 1.25rem' }}>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm}>
            Add Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VaultSelectionRow({
  vault,
  selected,
  onToggle,
}: {
  vault: VaultSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <ChakraCheckbox.Root
      checked={selected}
      display="flex"
      w="full"
      alignItems="center"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor={selected ? 'teal.muted' : 'transparent'}
      bg={selected ? 'teal.subtle' : 'transparent'}
      px="3"
      py="2.5"
      cursor="pointer"
      _hover={{ bg: selected ? 'teal.subtle' : 'bg.subtle' }}
      onCheckedChange={onToggle}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control flexShrink="0">
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
      <Flex align="center" gap="3" minW="0" flex="1">
        <Flex boxSize="9" align="center" justify="center" rounded="md" bg="bg.surface" color="teal.fg">
          <Vault size={18} />
        </Flex>
        <Box minW="0" flex="1">
          <Text truncate fontSize="sm" fontWeight="semibold" color="fg">
            {vault.name}
          </Text>
          <Text truncate fontSize="xs" color="fg.muted">
            {vault.fileCount} documents
          </Text>
        </Box>
      </Flex>
    </ChakraCheckbox.Root>
  );
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
  const [vaultFilter, setVaultFilter] = useState('all');
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, DraftChatDocument>>(new Map());
  const selectableVaults = useMemo(
    () => vaults.filter(vault => vault.aiAccessLevel === 'document_chat' || vault.aiAccessLevel === 'full'),
    [vaults],
  );
  const effectiveVaultIds = vaultFilter === 'all'
    ? selectableVaults.map(vault => vault.id)
    : [vaultFilter];
  const documentQuery = useGlobalSearchDocumentsQuery({
    query,
    pageIndex: 0,
    pageSize: 100,
    vaultIds: effectiveVaultIds,
    sortBy: 'name_asc',
    enabled: open && effectiveVaultIds.length > 0,
  });
  const documents = documentQuery.data?.results ?? [];

  useEffect(() => {
    if (!open) return;
    setSelectedDocuments(new Map(context.documents.map(document => [documentKey(document), document])));
    setQuery('');
    setVaultFilter('all');
  }, [context.documents, open]);

  function toggleDocument(document: SearchResultItem) {
    const draftDocument: DraftChatDocument = {
      vaultId: document.vaultId,
      documentId: document.documentId,
      name: document.name,
      vaultName: document.vaultName,
      path: document.vaultName,
      mimeType: document.mimeType,
    };
    const key = documentKey(draftDocument);

    setSelectedDocuments((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, draftDocument);
      return next;
    });
  }

  function confirm() {
    onConfirm([...selectedDocuments.values()]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="48rem">
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Add Documents</DialogTitle>
          <DialogDescription>Select indexed documents from vaults with AI access.</DialogDescription>
        </DialogHeader>
        <Stack gap="3" px="5" pb="4">
          <Flex gap="2" direction={{ base: 'column', sm: 'row' }}>
            <Flex align="center" gap="2" flex="1">
              <Search size={16} color="var(--chakra-colors-fg-muted)" />
              <Input
                aria-label="Search documents"
                value={query}
                placeholder="Search documents"
                onChange={(event) => setQuery(event.target.value)}
              />
            </Flex>
            <Box w={{ base: 'full', sm: '14rem' }}>
              <Select value={vaultFilter} onValueChange={setVaultFilter}>
                <SelectTrigger aria-label="Filter by vault">
                  <SelectValue placeholder="All vaults" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vaults</SelectItem>
                  {selectableVaults.map(vault => (
                    <SelectItem key={vault.id} value={vault.id}>
                      {vault.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          </Flex>

          <Box h="24rem" rounded="lg" borderWidth="1px" borderColor="border.surface" overflow="hidden">
            {documentQuery.isLoading ? (
              <Flex h="full" align="center" justify="center" px="6" color="fg.muted">
                <Text fontSize="sm">Loading documents...</Text>
              </Flex>
            ) : documents.length === 0 ? (
              <Flex h="full" align="center" justify="center" px="6" textAlign="center" color="fg.muted">
                <Text fontSize="sm">No documents found.</Text>
              </Flex>
            ) : (
              <Virtuoso
                style={{ height: '100%' }}
                data={documents}
                initialItemCount={Math.min(documents.length, 24)}
                itemContent={(_, document) => (
                  <Box px="2" py="1.5">
                    <DocumentSelectionRow
                      document={document}
                      selected={selectedDocuments.has(`${document.vaultId}:${document.documentId}`)}
                      onToggle={() => toggleDocument(document)}
                    />
                  </Box>
                )}
              />
            )}
          </Box>
        </Stack>
        <DialogFooter style={{ padding: '0 1.25rem 1.25rem' }}>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm}>
            Add Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentSelectionRow({
  document,
  selected,
  onToggle,
}: {
  document: SearchResultItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const { badgeBg, badgeColor, color, icon: DocumentIcon, label } = getDocumentFileIconMeta({
    name: document.name,
    mimeType: document.mimeType,
  });

  return (
    <ChakraCheckbox.Root
      checked={selected}
      display="flex"
      w="full"
      alignItems="center"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor={selected ? 'teal.muted' : 'transparent'}
      bg={selected ? 'teal.subtle' : 'transparent'}
      px="3"
      py="2.5"
      cursor="pointer"
      _hover={{ bg: selected ? 'teal.subtle' : 'bg.subtle' }}
      onCheckedChange={onToggle}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control flexShrink="0">
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
      <Flex align="center" gap="3" minW="0" flex="1">
        <Flex boxSize="10" align="center" justify="center" color={color} flexShrink="0">
          <Box position="relative" boxSize="9">
            <DocumentIcon size={36} strokeWidth={1.5} />
            <Text
              as="span"
              position="absolute"
              left="50%"
              top="64%"
              transform="translate(-50%, -50%)"
              maxW="9"
              truncate
              rounded="2px"
              bg={badgeBg}
              px="1"
              py="0.5"
              fontSize="0.46rem"
              fontWeight="bold"
              lineHeight="1"
              color={badgeColor}
            >
              {label}
            </Text>
          </Box>
        </Flex>
        <Box minW="0" flex="1">
          <Text truncate fontSize="sm" fontWeight="semibold" color="fg">
            {document.name}
          </Text>
          <Flex align="center" gap="1.5" minW="0" color="fg.muted">
            <Folder size={13} />
            <Text truncate fontSize="xs">
              {document.vaultName}
            </Text>
          </Flex>
        </Box>
        {selected ? <Check size={16} color="var(--chakra-colors-teal-fg)" /> : null}
      </Flex>
    </ChakraCheckbox.Root>
  );
}

export function ConversationForkDialog({
  open,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="28rem">
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Changing context creates a new conversation.</DialogTitle>
          <DialogDescription>
            The current conversation keeps its original retrieval scope.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter style={{ padding: '0 1.25rem 1.25rem' }}>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={onConfirm}>
            Continue in New Chat
          </Button>
        </DialogFooter>
        <CloseButton
          size="sm"
          position="absolute"
          top="3"
          right="3"
          aria-label="Close context change dialog"
          onClick={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

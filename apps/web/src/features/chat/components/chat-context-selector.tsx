/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Box, Checkbox as ChakraCheckbox, CloseButton, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, FileText, Folder, Lock, Paperclip, Search, Vault, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchFilterMultiSelect } from '@/features/documents/components/document-search-controls';
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

  return (
    <Flex align="center" gap="2" flexWrap="wrap" pb="2" aria-label="Active conversation context">
      <Flex align="center" gap="2" flexShrink="0">
        <Text as="span" fontSize="xs" fontWeight="semibold" color="fg.muted">
          Context:
        </Text>
        {locked ? <LockedContextBadge /> : null}
      </Flex>
      {hasContext ? (
        <>
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
        </>
      ) : (
        <ContextChip
          icon={<Vault size={14} />}
          label="All accessible vaults"
          locked={locked}
          readOnly
        />
      )}
    </Flex>
  );
}

function LockedContextBadge() {
  return (
    <Tooltip positioning={{ placement: 'top' }}>
      <TooltipTrigger asChild>
        <chakra.button
          type="button"
          aria-label="Locked Context: this conversation uses a fixed document and vault context"
          cursor="help"
          display="inline-flex"
          alignItems="center"
          gap="1"
          rounded="full"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.subtle"
          px="2"
          py="1"
          color="fg.muted"
          fontSize="0.68rem"
          fontWeight="semibold"
          lineHeight="1"
          textTransform="uppercase"
          _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
        >
          <Lock size={11} />
          Locked Context
        </chakra.button>
      </TooltipTrigger>
      <TooltipContent>
        This conversation uses a fixed document and vault context to preserve consistent references and history.
      </TooltipContent>
    </Tooltip>
  );
}

function ContextChip({
  icon,
  label,
  detail,
  locked,
  readOnly,
  removeLabel,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  locked: boolean;
  readOnly?: boolean;
  removeLabel?: string;
  onRemove?: () => void;
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
      {!readOnly && removeLabel && onRemove ? (
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
      ) : null}
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
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="3"
            right="3"
            aria-label="Close add vaults dialog"
          />
        </DialogClose>
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Add Vaults</DialogTitle>
          <DialogDescription>Only vaults with full AI access are shown.</DialogDescription>
        </DialogHeader>
        <DialogBody asChild>
          <Stack gap="3" px="5" pb="4">
            <Box position="relative">
              <Box
                position="absolute"
                left="3"
                top="50%"
                transform="translateY(-50%)"
                color="fg.muted"
                pointerEvents="none"
              >
                <Search size={16} />
              </Box>
              <Input
                aria-label="Search vaults"
                value={query}
                placeholder="Search vaults"
                pl="9"
                onChange={(event) => setQuery(event.target.value)}
              />
            </Box>
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
                    <Box px="2" py="1">
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
          </Stack>
        </DialogBody>
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
        <Flex boxSize="10" align="center" justify="center" color="teal.fg" flexShrink="0">
          <Vault size={36} strokeWidth={1.5} />
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
  const [selectedFilterVaultIds, setSelectedFilterVaultIds] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, DraftChatDocument>>(new Map());
  const selectableVaults = useMemo(
    () => vaults.filter(vault => vault.aiAccessLevel === 'document_chat' || vault.aiAccessLevel === 'full'),
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
  const documents = documentQuery.data?.results ?? [];

  useEffect(() => {
    if (!open) return;
    setSelectedDocuments(new Map(context.documents.map(document => [documentKey(document), document])));
    setQuery('');
    setSelectedFilterVaultIds([]);
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
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="3"
            right="3"
            aria-label="Close add documents dialog"
          />
        </DialogClose>
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Add Documents</DialogTitle>
          <DialogDescription>Only indexed documents from vaults with AI access are shown.</DialogDescription>
        </DialogHeader>
        <DialogBody asChild>
          <Stack gap="3" px="5" pb="4">
            <Flex gap="2" direction={{ base: 'column', sm: 'row' }}>
              <Box position="relative" flex="1">
                <Box
                  position="absolute"
                  left="3"
                  top="50%"
                  transform="translateY(-50%)"
                  color="fg.muted"
                  pointerEvents="none"
                >
                  <Search size={16} />
                </Box>
                <Input
                  aria-label="Search documents"
                  value={query}
                  placeholder="Search documents"
                  pl="9"
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
                />
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
                    <Box px="2" py="1">
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
        </DialogBody>
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
            Continue in New Conversation
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

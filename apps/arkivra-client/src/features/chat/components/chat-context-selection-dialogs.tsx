import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Box,
  Checkmark,
  CloseButton,
  Flex,
  Listbox,
  Stack,
  Text,
  createListCollection,
  useListboxItemContext,
  useLiveRef,
} from '@chakra-ui/react';
import { FileText, Plus, Search, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchFilterMultiSelect } from '@/features/documents/components/document-search-controls';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { VaultSummary } from '@/features/vaults/vaults.types';
import { documentKey, normalizeDraftContext } from './chat-context-model';
import type {
  DocumentListboxOption,
  DraftChatContext,
  DraftChatDocument,
  DraftChatVault,
  ScrollToIndexDetails,
  VaultListboxOption,
} from './chat-context-model';

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
    () => vaults.filter((vault) => vault.aiAccessLevel === 'full'),
    [vaults],
  );
  const filteredVaults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return availableVaults;
    return availableVaults.filter(
      (vault) =>
        vault.name.toLowerCase().includes(normalizedQuery) ||
        vault.description?.toLowerCase().includes(normalizedQuery),
    );
  }, [availableVaults, query]);
  const vaultOptions = useMemo<VaultListboxOption[]>(
    () =>
      filteredVaults.map((vault) => ({
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
    setSelectedIds(new Set(context.vaults.map((vault) => vault.vaultId)));
    setQuery('');
  }, [context.vaults, open]);

  function confirm() {
    const selectedVaults = availableVaults
      .filter((vault) => selectedIds.has(vault.id))
      .map((vault) => ({ vaultId: vault.id, name: vault.name }));
    onConfirm(selectedVaults);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        maxW="40rem"
        w="calc(100vw - 2rem)"
        bg="bg.modalHeader"
        p="0"
        rounded="xl"
        shadow="lg"
      >
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
            _focusVisible={{
              outline: '2px solid',
              outlineColor: 'teal.focusRing',
              outlineOffset: '2px',
            }}
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
              <Flex
                boxSize="10"
                align="center"
                justify="center"
                rounded="lg"
                bg="bg.subtle"
                color="fg.muted"
                flexShrink="0"
              >
                <Vault size={18} />
              </Flex>
              <Stack gap="0.5" minW="0">
                <DialogTitle fontSize="lg" lineHeight="1.25">
                  Add Vaults
                </DialogTitle>
                <DialogDescription>Only vaults with full AI access are shown.</DialogDescription>
              </Stack>
            </Flex>
          </DialogHeader>
        </Box>
        <DialogBody asChild>
          <Stack
            gap="3"
            px={{ base: '5', sm: '6' }}
            py={{ base: '5', sm: '6' }}
            bg="bg.modalContent"
          >
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
                  _focusVisible={{
                    borderColor: 'teal.solid',
                    boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)',
                  }}
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
                    <Flex
                      h="full"
                      minH="18rem"
                      align="center"
                      justify="center"
                      px="6"
                      textAlign="center"
                      color="fg.muted"
                    >
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
                              '&[data-highlighted][data-selected], &[data-selected], &[data-selected]:hover':
                                {
                                  background: 'var(--chakra-colors-teal-subtle)',
                                },
                            }}
                          >
                            <Box flexShrink="0">
                              <ListboxItemCheckmark />
                            </Box>
                            <Box minW="0" flex="1">
                              <Listbox.ItemText>
                                <Text
                                  truncate
                                  fontSize="sm"
                                  fontWeight="semibold"
                                  lineHeight="1.35"
                                  color="fg"
                                >
                                  {vault.label}
                                </Text>
                              </Listbox.ItemText>
                              <Text
                                mt="0.5"
                                truncate
                                fontSize="xs"
                                lineHeight="1.3"
                                color="fg.muted"
                              >
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

function useListboxVirtualizer({ count, estimateSize }: { count: number; estimateSize: number }) {
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
      const virtualItem = currentVirtualizer
        .getVirtualItems()
        .find((item) => item.index === details.index);

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
    virtualItems:
      virtualItems.length > 0
        ? virtualItems
        : getFallbackListboxVirtualItems({ count, estimateSize }),
    getViewportProps(props: ComponentProps<'div'> = {}): ComponentProps<'div'> {
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
  return Array.from(
    { length: Math.min(count, 12) },
    (_, index): VirtualItem => ({
      end: (index + 1) * estimateSize,
      index,
      key: index,
      lane: 0,
      size: estimateSize,
      start: index * estimateSize,
    }),
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
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, DraftChatDocument>>(
    () => new Map(),
  );
  const selectableVaults = useMemo(
    () => vaults.filter((vault) => vault.aiAccessLevel === 'full'),
    [vaults],
  );
  const effectiveVaultIds =
    selectedFilterVaultIds.length === 0
      ? selectableVaults.map((vault) => vault.id)
      : selectedFilterVaultIds;
  const selectedFilterVaults = useMemo(
    () => selectableVaults.filter((vault) => selectedFilterVaultIds.includes(vault.id)),
    [selectableVaults, selectedFilterVaultIds],
  );
  const selectedFilterVaultsLabel = useMemo(() => {
    if (selectedFilterVaults.length === 0) return 'All vaults';
    if (selectedFilterVaults.length <= 2)
      return selectedFilterVaults.map((vault) => vault.name).join(', ');
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
    () => new Map(normalizeDraftContext(context).vaults.map((vault) => [vault.vaultId, vault])),
    [context],
  );
  const documentOptions = useMemo<DocumentListboxOption[]>(
    () =>
      (documentQuery.data?.results ?? []).map((document) => {
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
  const selectedDocumentLabel =
    selectedDocumentCount === 1
      ? '1 document selected'
      : `${selectedDocumentCount} documents selected`;

  useEffect(() => {
    if (!open) return;
    setSelectedDocuments(
      new Map(context.documents.map((document) => [documentKey(document), document])),
    );
    setQuery('');
    setSelectedFilterVaultIds([]);
  }, [context.documents, open]);

  function handleDocumentValueChange(details: { value: string[]; items: DocumentListboxOption[] }) {
    const visibleKeys = new Set(documentOptions.map((option) => option.value));
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
      <DialogContent
        hideCloseButton
        maxW="40rem"
        w="calc(100vw - 2rem)"
        bg="bg.modalHeader"
        p="0"
        rounded="xl"
        shadow="lg"
      >
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
            _focusVisible={{
              outline: '2px solid',
              outlineColor: 'teal.focusRing',
              outlineOffset: '2px',
            }}
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
              <Flex
                boxSize="10"
                align="center"
                justify="center"
                rounded="lg"
                bg="bg.subtle"
                color="fg.muted"
                flexShrink="0"
              >
                <FileText size={18} />
              </Flex>
              <Stack gap="0.5" minW="0">
                <DialogTitle fontSize="lg" lineHeight="1.25">
                  Add Documents
                </DialogTitle>
                <DialogDescription>
                  Only indexed documents from vaults with AI access are shown.
                </DialogDescription>
              </Stack>
            </Flex>
          </DialogHeader>
        </Box>
        <DialogBody asChild>
          <Stack
            gap="3"
            px={{ base: '5', sm: '6' }}
            py={{ base: '5', sm: '6' }}
            bg="bg.modalContent"
          >
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
                    _focusVisible={{
                      borderColor: 'teal.solid',
                      boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)',
                    }}
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
                    options={selectableVaults.map((vault) => ({
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
                  <Flex
                    h="full"
                    minH="20rem"
                    align="center"
                    justify="center"
                    px="6"
                    color="fg.muted"
                  >
                    <Text fontSize="sm">Loading documents...</Text>
                  </Flex>
                ) : documentCollection.items.length === 0 ? (
                  <Listbox.Empty>
                    <Flex
                      h="full"
                      minH="20rem"
                      align="center"
                      justify="center"
                      px="6"
                      textAlign="center"
                      color="fg.muted"
                    >
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
                              '&[data-highlighted][data-selected], &[data-selected], &[data-selected]:hover':
                                {
                                  background: 'var(--chakra-colors-teal-subtle)',
                                },
                            }}
                          >
                            <Box flexShrink="0">
                              <ListboxItemCheckmark />
                            </Box>
                            <Box minW="0" flex="1">
                              <Listbox.ItemText>
                                <Text
                                  truncate
                                  fontSize="sm"
                                  fontWeight="semibold"
                                  lineHeight="1.35"
                                  color={item.disabled ? 'fg.muted' : 'fg'}
                                >
                                  {item.label}
                                </Text>
                              </Listbox.ItemText>
                              <Text
                                mt="0.5"
                                truncate
                                fontSize="xs"
                                lineHeight="1.3"
                                color="fg.muted"
                              >
                                {item.description}
                              </Text>
                              {item.disabledReason ? (
                                <Text
                                  mt="0.5"
                                  truncate
                                  fontSize="xs"
                                  lineHeight="1.3"
                                  color="fg.muted"
                                >
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

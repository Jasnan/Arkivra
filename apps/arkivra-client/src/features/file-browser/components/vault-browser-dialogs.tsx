import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Box,
  CloseButton,
  Dialog as ChakraDialog,
  Flex,
  Grid,
  Portal,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { Check, Folder, Home, Search } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBytes } from '@/features/documents/documents.utils';
import { formatShortDate } from '@/lib/localization';
import { getBrowserItemKey, getDocumentTypeLabel, getItemName } from './vault-browser.types';
import type {
  BrowserContextItem,
  BrowserItem,
  InfoDialogTarget,
  ItemDialogTarget,
  MoveDestination,
  MoveDialogTarget,
} from './vault-browser.types';

function formatDateOnly(value: string | null) {
  return formatShortDate(value);
}

function getItemId(item: BrowserContextItem) {
  if (item.type === 'root') {
    return item.vaultId;
  }

  if (item.type === 'background') {
    return item.folderId ?? item.vaultId;
  }

  return item.type === 'folder' ? item.folder.id : item.document.id;
}

function getItemKindLabel(item: BrowserContextItem) {
  if (item.type === 'root') {
    return 'Folder';
  }

  if (item.type === 'background') {
    return 'Folder';
  }

  return item.type === 'folder'
    ? 'Folder'
    : getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Grid templateColumns="8rem minmax(0, 1fr)" gap="4" alignItems="start">
      <Text fontSize="sm" color="fg.muted">
        {label}
      </Text>
      <Text minW="0" fontSize="sm" color="fg" wordBreak="break-word">
        {value}
      </Text>
    </Grid>
  );
}

const closedMoveDialogTarget: BrowserItem = {
  type: 'folder',
  folder: {
    id: '__closed_move_dialog__',
    vaultId: '',
    parentId: null,
    name: 'item',
    createdBy: '',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: '',
    updatedAt: '',
  },
};

function getMoveDialogTargets(target: MoveDialogTarget) {
  if (Array.isArray(target)) {
    return target;
  }

  return target === null ? [] : [target];
}

function getMoveDialogTargetKey(targets: BrowserItem[]) {
  if (targets.length === 0) {
    return '__closed_move_dialog__';
  }

  return targets.map((item) => getBrowserItemKey(item)).join('|');
}

function getMoveDialogTitle(targets: BrowserItem[]) {
  if (targets.length === 1) {
    return `Move ${getItemName(targets[0]!)}`;
  }

  return `Move ${targets.length} items`;
}

function getCommonDestinationId(targets: BrowserItem[]) {
  if (targets.length === 0) {
    return null;
  }

  const [firstTarget] = targets;
  const firstDestinationId =
    firstTarget.type === 'folder' ? firstTarget.folder.parentId : firstTarget.document.folderId;

  return targets.every((target) => {
    const destinationId =
      target.type === 'folder' ? target.folder.parentId : target.document.folderId;
    return destinationId === firstDestinationId;
  })
    ? firstDestinationId
    : undefined;
}

export function RenameItemDialog({
  open,
  target,
  value,
  isPending,
  onValueChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  target: ItemDialogTarget;
  value: string;
  isPending: boolean;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const targetType = target?.type ?? 'item';
  const originalName = target ? getItemName(target) : '';
  const isRenameFormDirty = value !== originalName;
  const canDismissRenameDialog = !isRenameFormDirty && !isPending;

  return (
    <ChakraDialog.Root
      open={open}
      closeOnEscape={canDismissRenameDialog}
      closeOnInteractOutside={canDismissRenameDialog}
      onOpenChange={(event) => {
        if (!event.open && !isPending) onClose();
      }}
      size={{ mdDown: 'full', md: 'md' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Rename ${targetType}`}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <chakra.form
                id="rename-item-form"
                display="flex"
                flexDirection="column"
                gap="4"
                onSubmit={onSubmit}
              >
                <chakra.label
                  htmlFor="rename-item-name"
                  fontSize="sm"
                  fontWeight="medium"
                  color="fg"
                >
                  Name
                </chakra.label>
                <Input
                  id="rename-item-name"
                  autoFocus
                  value={value}
                  maxLength={255}
                  onChange={(event) => onValueChange(event.target.value)}
                />
              </chakra.form>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <Button
                type="submit"
                form="rename-item-form"
                disabled={value.trim().length === 0 || isPending}
              >
                {isPending ? 'Renaming...' : 'Rename'}
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function MoveItemDialog({
  open,
  target,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: MoveItemDialogProps) {
  const dialogTargets = getMoveDialogTargets(target);

  return (
    <OpenMoveItemDialog
      open={open}
      targets={dialogTargets.length > 0 ? dialogTargets : [closedMoveDialogTarget]}
      value={value}
      destinations={destinations}
      isPending={isPending}
      isLoading={isLoading}
      onValueChange={onValueChange}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

interface MoveItemDialogProps {
  open: boolean;
  target: MoveDialogTarget;
  value: string | null;
  destinations: MoveDestination[];
  isPending: boolean;
  isLoading: boolean;
  onValueChange: (value: string | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface OpenMoveItemDialogProps extends Omit<MoveItemDialogProps, 'target'> {
  open: boolean;
  targets: BrowserItem[];
}

function OpenMoveItemDialog({
  open,
  targets,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: OpenMoveItemDialogProps) {
  const targetKey = getMoveDialogTargetKey(targets);
  const [searchState, setSearchState] = useState({ targetKey: '', value: '' });
  const searchQuery = searchState.targetKey === targetKey ? searchState.value : '';

  const filteredDestinations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (normalizedQuery.length === 0) {
      return destinations;
    }

    return destinations.filter((destination) => {
      const searchableText = `${destination.name} ${destination.label}`.toLocaleLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [destinations, searchQuery]);

  const currentDestinationId = getCommonDestinationId(targets);
  const selectedDestination =
    destinations.find((destination) => destination.id === value) ?? destinations[0] ?? null;
  const hasMoveSelectionChanged =
    currentDestinationId === undefined ? value !== null : value !== currentDestinationId;
  const isMoveFormDirty = searchQuery.trim().length > 0 || hasMoveSelectionChanged;
  const canDismissMoveDialog = !isMoveFormDirty && !isPending;
  const canSubmitMove =
    !isLoading &&
    !isPending &&
    targets.length > 0 &&
    selectedDestination !== null &&
    value === selectedDestination.id &&
    (currentDestinationId === undefined || value !== currentDestinationId);

  return (
    <ChakraDialog.Root
      open={open}
      closeOnEscape={canDismissMoveDialog}
      closeOnInteractOutside={canDismissMoveDialog}
      onOpenChange={(event) => {
        if (!event.open && !isPending) onClose();
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{getMoveDialogTitle(targets)}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <chakra.form
                id="move-item-form"
                display="flex"
                flexDirection="column"
                gap="4"
                onSubmit={onSubmit}
              >
                <chakra.label
                  htmlFor="move-item-folder-search"
                  fontSize="sm"
                  fontWeight="medium"
                  color="fg"
                >
                  Search folders
                </chakra.label>
                <Box position="relative">
                  <Flex
                    position="absolute"
                    top="0"
                    bottom="0"
                    left="3"
                    align="center"
                    color="fg.muted"
                    pointerEvents="none"
                  >
                    <Search size={16} />
                  </Flex>
                  <Input
                    id="move-item-folder-search"
                    autoFocus
                    value={searchQuery}
                    disabled={isLoading || isPending}
                    pl="9"
                    placeholder="Find a destination"
                    onChange={(event) => setSearchState({ targetKey, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                      }
                    }}
                  />
                </Box>
                <Box
                  role="listbox"
                  aria-label="Move destination"
                  h={{ base: '18rem', md: '20rem' }}
                  overflow="hidden"
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                >
                  {isLoading ? (
                    <Flex h="full" align="center" justify="center" px="4">
                      <Text fontSize="sm" color="fg.muted">
                        Loading folders...
                      </Text>
                    </Flex>
                  ) : filteredDestinations.length === 0 ? (
                    <Flex h="full" align="center" justify="center" px="4">
                      <Text fontSize="sm" color="fg.muted">
                        No folders found.
                      </Text>
                    </Flex>
                  ) : (
                    <Virtuoso
                      data={filteredDestinations}
                      computeItemKey={(index, destination) =>
                        destination?.id ?? `__destination_${index}`
                      }
                      initialItemCount={Math.min(filteredDestinations.length, 32)}
                      style={{ height: '100%' }}
                      itemContent={(index, destination) => {
                        if (destination === undefined) {
                          return null;
                        }

                        const isSelected = destination.id === value;
                        const isCurrent =
                          currentDestinationId !== undefined &&
                          destination.id === currentDestinationId;
                        const icon =
                          destination.id === null ? <Home size={16} /> : <Folder size={16} />;

                        return (
                          <chakra.button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={isPending}
                            display="flex"
                            w="full"
                            minH="3rem"
                            alignItems="center"
                            gap="3"
                            borderBottomWidth={
                              index === filteredDestinations.length - 1 ? '0' : '1px'
                            }
                            borderColor="border.surface"
                            bg={isSelected ? 'teal.subtle' : 'transparent'}
                            px="3"
                            py="2"
                            textAlign="left"
                            transition="background-color 0.15s ease"
                            _hover={{ bg: isSelected ? 'teal.subtle' : 'bg.subtle' }}
                            _focusVisible={{
                              outline: '2px solid',
                              outlineColor: 'teal.solid',
                              outlineOffset: '-2px',
                            }}
                            onClick={() => onValueChange(destination.id)}
                          >
                            <Flex
                              minW="0"
                              flex="1"
                              align="center"
                              gap="3"
                              ps={`${Math.min(destination.depth, 8) * 0.75}rem`}
                            >
                              <Flex
                                boxSize="7"
                                shrink={0}
                                align="center"
                                justify="center"
                                rounded="md"
                                bg={destination.id === null ? 'bg.subtle' : 'teal.subtle'}
                                color={destination.id === null ? 'fg.muted' : 'teal.fg'}
                              >
                                {icon}
                              </Flex>
                              <Box minW="0">
                                <Flex minW="0" align="center" gap="2">
                                  <Text truncate fontSize="sm" fontWeight="semibold" color="fg">
                                    {destination.name}
                                  </Text>
                                  {isCurrent ? (
                                    <Text as="span" flexShrink={0} textStyle="xs" color="fg.muted">
                                      Current
                                    </Text>
                                  ) : null}
                                </Flex>
                                {destination.label !== destination.name ? (
                                  <Text mt="0.5" truncate textStyle="xs" color="fg.muted">
                                    {destination.label}
                                  </Text>
                                ) : null}
                              </Box>
                            </Flex>
                            <Flex
                              boxSize="5"
                              shrink={0}
                              align="center"
                              justify="center"
                              color={isSelected ? 'teal.solid' : 'transparent'}
                            >
                              <Check size={16} strokeWidth={2.5} />
                            </Flex>
                          </chakra.button>
                        );
                      }}
                    />
                  )}
                </Box>
                {selectedDestination !== null ? (
                  <Text fontSize="sm" color="fg.muted">
                    Destination: {selectedDestination.label}
                  </Text>
                ) : null}
              </chakra.form>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <Button type="submit" form="move-item-form" disabled={!canSubmitMove}>
                {isPending ? 'Moving...' : 'Move'}
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function ItemInfoDialog({
  open,
  target,
  folderPath,
  onClose,
}: {
  open: boolean;
  target: InfoDialogTarget;
  folderPath: string;
  onClose: () => void;
}) {
  const titleTarget: BrowserContextItem = target ?? {
    type: 'background',
    vaultId: '',
    folderId: null,
    name: 'Current folder',
  };

  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open) onClose();
      }}
      size={{ mdDown: 'full', md: 'md' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>Info</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Stack gap="3">
                <InfoRow label="Name" value={getItemName(titleTarget)} />
                <InfoRow label="Type" value={getItemKindLabel(titleTarget)} />
                {titleTarget.type !== 'root' && titleTarget.type !== 'background' ? (
                  <InfoRow label="Location" value={folderPath} />
                ) : null}
                {titleTarget.type === 'document' ? (
                  <>
                    <InfoRow label="Size" value={formatBytes(titleTarget.document.originalSize)} />
                    <InfoRow label="Original file" value={titleTarget.document.originalName} />
                    <InfoRow label="MIME type" value={titleTarget.document.mimeType} />
                  </>
                ) : null}
                {titleTarget.type === 'folder' || titleTarget.type === 'document' ? (
                  <>
                    <InfoRow
                      label="Created"
                      value={formatDateOnly(
                        titleTarget.type === 'folder'
                          ? titleTarget.folder.createdAt
                          : titleTarget.document.createdAt,
                      )}
                    />
                    <InfoRow
                      label="Updated"
                      value={formatDateOnly(
                        titleTarget.type === 'folder'
                          ? titleTarget.folder.updatedAt
                          : titleTarget.document.updatedAt,
                      )}
                    />
                  </>
                ) : null}
                <InfoRow
                  label={titleTarget.type === 'root' ? 'Vault ID' : 'ID'}
                  value={getItemId(titleTarget)}
                />
              </Stack>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button type="button" onClick={onClose}>
                Close
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

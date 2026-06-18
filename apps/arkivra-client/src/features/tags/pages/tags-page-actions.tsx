/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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
import { Link } from '@tanstack/react-router';
import { Files } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { DeleteButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { Tag, TagDocument } from '@/features/tags/tags.types';
import { formatShortDate } from '@/lib/localization';

const TAG_DOCUMENTS_LIST_MAX_ROWS = 10;
const TAG_DOCUMENTS_LIST_ROW_HEIGHT = '4.25rem';

export type TagContextMenuState = {
  tag: Tag;
  x: number;
  y: number;
} | null;

export interface TagAction {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'destructive';
  disabled?: boolean;
  onSelect: () => void;
}

function getTagActionMenuColors(tone: TagAction['tone'], active: boolean) {
  const inactiveColor = tone === 'destructive' ? 'fg.error' : 'fg.muted';
  const activeColor = tone === 'destructive' ? 'fg.error' : 'teal.fg';

  return {
    inactiveColor,
    activeColor,
    color: active ? activeColor : inactiveColor,
  };
}

function TagDropdownMenuItem({
  action,
  onSelect,
  children,
}: {
  action: TagAction;
  onSelect: () => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const colors = getTagActionMenuColors(action.tone, active);

  return (
    <DropdownMenuItem
      value={action.key}
      data-active={active ? 'true' : undefined}
      borderWidth="1px"
      borderColor={active ? 'teal.muted' : 'transparent'}
      bg={active ? 'teal.subtle' : 'transparent'}
      color={colors.color}
      transition="background-color 120ms ease, border-color 120ms ease, color 120ms ease"
      _hover={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: colors.activeColor }}
      _focus={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: colors.activeColor }}
      _highlighted={{ bg: 'transparent', borderColor: 'transparent', color: colors.inactiveColor }}
      onPointerEnter={() => setActive(true)}
      onPointerMove={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onSelect={onSelect}
    >
      {children}
    </DropdownMenuItem>
  );
}

export function DeleteTagDialog({
  open,
  tag,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  tag: Tag | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const attachedDocuments = tag?.documentsCount ?? 0;
  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open && !isPending) onClose();
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Delete “${tag?.name ?? 'tag'}”?`}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Text color="fg.muted" fontSize="sm">
                {attachedDocuments > 0
                  ? `This tag is currently attached to ${attachedDocuments} document${attachedDocuments === 1 ? '' : 's'}. Deleting it here will remove the tag from all of those documents.`
                  : 'This tag is not attached to any documents right now.'}
              </Text>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button variant="outline" onClick={onClose} disabled={isPending}>
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <DeleteButton type="button" onClick={onConfirm} disabled={isPending}>
                {isPending ? 'Deleting...' : 'Delete'}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function DeleteTagsDialog({
  open,
  tags,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  tags: Tag[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const attachedDocuments = tags.reduce((total, tag) => total + (tag.documentsCount ?? 0), 0);

  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open && !isPending) onClose();
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Delete ${tags.length} tags?`}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Stack gap="3">
                <Text color="fg.muted" fontSize="sm">
                  {attachedDocuments > 0
                    ? `These tags are currently attached to ${attachedDocuments} document${attachedDocuments === 1 ? '' : 's'} in total. Deleting them here will remove those tags from all attached documents.`
                    : 'These tags are not attached to any documents right now.'}
                </Text>
                <Box
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.subtle"
                  px="4"
                  py="3"
                >
                  <Text fontSize="sm" color="fg">
                    {tags.map((tag) => tag.name).join(', ')}
                  </Text>
                </Box>
              </Stack>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button variant="outline" onClick={onClose} disabled={isPending}>
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <DeleteButton type="button" onClick={onConfirm} disabled={isPending}>
                {isPending ? 'Deleting...' : 'Delete'}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function TagActionsMenu({
  tag,
  actions,
}: {
  tag: Tag;
  actions: (trigger: HTMLButtonElement | null) => TagAction[];
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const availableActions = actions(null).filter((action) => !action.disabled);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionMenuTriggerButton
          ref={triggerRef}
          label={`Open actions for ${tag.name}`}
          disabled={availableActions.length === 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minWidth="12rem">
        {availableActions.map((action) => (
          <TagDropdownMenuItem
            key={action.key}
            action={action}
            onSelect={() => {
              actions(triggerRef.current)
                .find((currentAction) => currentAction.key === action.key)
                ?.onSelect();
            }}
          >
            <ActionMenuItemIcon
              icon={action.icon}
              tone={action.tone === 'destructive' ? 'destructive' : 'default'}
            />
            {action.label}
          </TagDropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TagContextMenu({
  state,
  actions,
  onClose,
}: {
  state: Exclude<TagContextMenuState, null>;
  actions: TagAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const availableActions = actions.filter((action) => !action.disabled);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function closeOnOutsideContextMenu(event: globalThis.MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, { capture: true });
    window.document.addEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
    window.document.addEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, { capture: true });
      window.document.removeEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
      window.document.removeEventListener('contextmenu', closeOnOutsideContextMenu, {
        capture: true,
      });
    };
  }, [onClose]);

  return (
    <Portal>
      <Box
        ref={menuRef}
        role="menu"
        aria-label={`Tag actions for ${state.tag.name}`}
        position="fixed"
        zIndex="popover"
        minW="12rem"
        left={`${state.x}px`}
        top={`${state.y}px`}
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        p="1.5"
        shadow="xl"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Stack gap="1">
          {availableActions.map((action) => {
            const active = activeActionKey === action.key;
            const colors = getTagActionMenuColors(action.tone, active);

            return (
              <chakra.button
                key={action.key}
                type="button"
                role="menuitem"
                data-active={active ? 'true' : undefined}
                display="flex"
                minH="9"
                w="full"
                alignItems="center"
                gap="3"
                rounded="md"
                borderWidth="1px"
                borderColor={active ? 'teal.muted' : 'transparent'}
                bg={active ? 'teal.subtle' : 'transparent'}
                px="3"
                py="2"
                textAlign="left"
                fontSize="sm"
                fontWeight="medium"
                lineHeight="1.25"
                color={colors.color}
                transition="background-color 120ms ease, border-color 120ms ease, color 120ms ease"
                _hover={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: colors.activeColor }}
                _focus={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: colors.activeColor }}
                _focusVisible={{
                  outline: '2px solid',
                  outlineColor: 'teal.solid',
                  outlineOffset: '2px',
                }}
                onPointerEnter={() => setActiveActionKey(action.key)}
                onPointerMove={() => setActiveActionKey(action.key)}
                onPointerLeave={() =>
                  setActiveActionKey((current) => (current === action.key ? null : current))
                }
                onFocus={() => setActiveActionKey(action.key)}
                onBlur={() =>
                  setActiveActionKey((current) => (current === action.key ? null : current))
                }
                onClick={() => {
                  onClose();
                  window.setTimeout(action.onSelect, 0);
                }}
              >
                <ActionMenuItemIcon
                  icon={action.icon}
                  tone={action.tone === 'destructive' ? 'destructive' : 'default'}
                />
                {action.label}
              </chakra.button>
            );
          })}
        </Stack>
      </Box>
    </Portal>
  );
}

export function formatTagCreatedDate(value?: string) {
  if (!value) return 'Unknown date';
  return formatShortDate(value, { fallback: 'Unknown date' });
}

export function getTagDescription(tag: Tag) {
  const description = tag.description?.trim();
  return description && description.length > 0 ? description : '—';
}

export function TagDocumentsCountButton({
  tag,
  mobile = false,
  onOpen,
}: {
  tag: Tag;
  mobile?: boolean;
  onOpen: (tag: Tag, trigger: HTMLElement) => void;
}) {
  const documentsCount = tag.documentsCount ?? 0;
  const label = `${documentsCount} document${documentsCount === 1 ? '' : 's'}`;

  if (documentsCount === 0) {
    return mobile ? (
      <Text as="span">{label}</Text>
    ) : (
      <Flex align="center" gap="2" minW="0" color="fg.muted">
        <Files size={16} />
        <Text truncate fontSize="sm" fontWeight="medium" color="fg.muted">
          {documentsCount}
        </Text>
      </Flex>
    );
  }

  if (mobile) {
    return (
      <chakra.button
        type="button"
        aria-label={`View documents tagged ${tag.name}`}
        fontWeight="semibold"
        textDecoration="underline"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(tag, event.currentTarget);
        }}
      >
        {label}
      </chakra.button>
    );
  }

  return (
    <chakra.button
      type="button"
      aria-label={`View documents tagged ${tag.name}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(tag, event.currentTarget);
      }}
    >
      <Flex
        align="center"
        gap="2"
        minW="0"
        color="fg.muted"
        rounded="md"
        px="1"
        py="1"
        transition="background-color 0.15s ease, color 0.15s ease"
        _hover={{ bg: 'bg.subtle', color: 'teal.fg' }}
        _focusVisible={{
          outline: '2px solid',
          outlineColor: 'teal.focusRing',
          outlineOffset: '2px',
        }}
      >
        <Files size={16} />
        <Text truncate fontSize="sm" fontWeight="medium" color="currentColor">
          {documentsCount}
        </Text>
      </Flex>
    </chakra.button>
  );
}

export function TagDocumentsDialog({
  open,
  tag,
  documents,
  isLoading,
  isError,
  onClose,
}: {
  open: boolean;
  tag: Tag | null;
  documents: TagDocument[];
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}) {
  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open) onClose();
      }}
      size={{ mdDown: 'full', md: 'xl' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>
                {tag ? `Documents tagged “${tag.name}”` : 'Tagged documents'}
              </ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              {isLoading ? (
                <Text fontSize="sm" color="fg.muted">
                  Loading documents...
                </Text>
              ) : null}
              {isError ? (
                <Text fontSize="sm" color="fg.error">
                  Unable to load documents for this tag.
                </Text>
              ) : null}
              {!isLoading && !isError && documents.length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  No accessible documents use this tag.
                </Text>
              ) : null}
              {!isLoading && !isError && documents.length > 0 ? (
                <Stack
                  gap="0"
                  borderWidth="1px"
                  borderColor="border.surface"
                  rounded="md"
                  maxH={`calc(${TAG_DOCUMENTS_LIST_ROW_HEIGHT} * ${TAG_DOCUMENTS_LIST_MAX_ROWS})`}
                  overflowY="auto"
                  overscrollBehavior="contain"
                >
                  {documents.map((document) => (
                    <Link
                      key={`${document.vaultId}-${document.id}`}
                      to={ROUTES.vaultDocument(document.vaultId, document.id)}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                      aria-label={`Open ${document.name}`}
                    >
                      <Grid
                        templateColumns={{
                          base: '1fr',
                          md: 'minmax(0, 1fr) minmax(8rem, 12rem) minmax(5rem, 7rem)',
                        }}
                        gap="3"
                        alignItems="center"
                        minH={TAG_DOCUMENTS_LIST_ROW_HEIGHT}
                        px="4"
                        py="3"
                        borderBottomWidth="1px"
                        borderColor="border.surface"
                        _hover={{ bg: 'bg.subtle' }}
                        _last={{ borderBottomWidth: '0' }}
                      >
                        <Stack gap="1" minW="0">
                          <Text truncate fontSize="sm" fontWeight="semibold" color="fg">
                            {document.name}
                          </Text>
                          <Text truncate fontSize="xs" color="fg.muted">
                            {document.originalName}
                          </Text>
                        </Stack>
                        <Text truncate fontSize="sm" color="fg.muted">
                          {document.vaultName}
                        </Text>
                        <Stack gap="1" minW="0">
                          <Text fontSize="sm" color="fg.muted">
                            {formatBytes(document.originalSize)}
                          </Text>
                          <Text fontSize="xs" color="fg.muted">
                            {formatDate(document.updatedAt)}
                          </Text>
                        </Stack>
                      </Grid>
                    </Link>
                  ))}
                </Stack>
              ) : null}
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

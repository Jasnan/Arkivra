import type { FormEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionBar,
  Box,
  Checkbox as ChakraCheckbox,
  Flex,
  Grid,
  HStack,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Tags, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toaster-store';
import { CreateButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { WorkspacePageTitle } from '@/components/layout/workspace-page-title';
import { createTag, deleteTag, updateTag } from '@/features/tags/tags.api';
import { TagBadge } from '@/features/tags/components/tag-badge';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useTagDocumentsQuery, useTagsQuery } from '@/features/tags/tags.queries';
import type { Tag } from '@/features/tags/tags.types';
import {
  DeleteTagDialog,
  DeleteTagsDialog,
  TagActionsMenu,
  TagContextMenu,
  TagDocumentsCountButton,
  TagDocumentsDialog,
  formatTagCreatedDate,
  getTagDescription,
} from './tags-page-actions';
import type { TagAction, TagContextMenuState } from './tags-page-actions';

type DialogMode = 'create' | 'edit';

const DEFAULT_TAG_COLOR = '#0EA5E9';
const TAGS_LIST_GRID_COLUMNS = '2.5rem minmax(0, 1fr) minmax(14rem, 1.4fr) 6.5rem 8.5rem 2.75rem';
function SelectionCheckbox({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean | 'indeterminate';
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <ChakraCheckbox.Root
      size="sm"
      checked={checked}
      aria-label={label}
      onCheckedChange={(event) => onCheckedChange(event.checked === true)}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control>
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
    </ChakraCheckbox.Root>
  );
}

export function TagsPage() {
  const queryClient = useQueryClient();
  const tagsQuery = useTagsQuery();

  const [filterText, setFilterText] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagPendingDelete, setTagPendingDelete] = useState<Tag | null>(null);
  const [contextMenu, setContextMenu] = useState<TagContextMenuState>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_TAG_COLOR);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagsPendingBulkDelete, setTagsPendingBulkDelete] = useState<Tag[]>([]);
  const [documentsTag, setDocumentsTag] = useState<Tag | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreTargetRef = useRef<HTMLElement | null>(null);

  const tags = useMemo(() => tagsQuery.data?.tags ?? [], [tagsQuery.data?.tags]);
  const tagDocumentsQuery = useTagDocumentsQuery({
    tagId: documentsTag?.id ?? '',
    enabled: documentsTag !== null,
  });
  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === editingTagId) ?? null,
    [editingTagId, tags],
  );

  const filteredTags = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();
    return tags.filter((tag) => {
      if (normalizedFilter.length === 0) return true;
      return [tag.name, tag.description ?? ''].some((value) =>
        value.toLowerCase().includes(normalizedFilter),
      );
    });
  }, [filterText, tags]);
  const selectedTags = useMemo(
    () => filteredTags.filter((tag) => selectedTagIds.includes(tag.id)),
    [filteredTags, selectedTagIds],
  );
  const allVisibleSelected =
    filteredTags.length > 0 && filteredTags.every((tag) => selectedTagIds.includes(tag.id));
  const someVisibleSelected =
    filteredTags.some((tag) => selectedTagIds.includes(tag.id)) && !allVisibleSelected;

  const rememberFocusTarget = useCallback((target?: HTMLElement | null) => {
    focusRestoreTargetRef.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }, []);

  const restoreFocusTarget = useCallback(() => {
    const target = focusRestoreTargetRef.current;
    focusRestoreTargetRef.current = null;
    if (target) {
      requestAnimationFrame(() => {
        setTimeout(() => target.focus(), 80);
      });
    }
  }, []);

  const openCreateDialog = useCallback(
    (trigger?: HTMLButtonElement | null) => {
      rememberFocusTarget(trigger ?? createButtonRef.current);
      setDialogMode('create');
      setEditingTagId(null);
      setFormName('');
      setFormDescription('');
      setFormColor(DEFAULT_TAG_COLOR);
      setIsDialogOpen(true);
    },
    [rememberFocusTarget],
  );

  function openEditDialog(tag: Tag, trigger?: HTMLButtonElement | null) {
    rememberFocusTarget(trigger);
    setDialogMode('edit');
    setEditingTagId(tag.id);
    setFormName(tag.name);
    setFormDescription(tag.description ?? '');
    setFormColor(tag.color ?? DEFAULT_TAG_COLOR);
    setIsDialogOpen(true);
  }

  function openDocumentsDialog(tag: Tag, trigger?: HTMLElement | null) {
    rememberFocusTarget(trigger);
    setDocumentsTag(tag);
  }

  function closeDocumentsDialog() {
    setDocumentsTag(null);
    restoreFocusTarget();
  }

  function closeDialog() {
    setIsDialogOpen(false);
    restoreFocusTarget();
  }
  const editingTag = editingTagId ? (tags.find((tag) => tag.id === editingTagId) ?? null) : null;
  const isTagDialogDirty =
    dialogMode === 'create'
      ? formName.trim().length > 0 ||
        formDescription.trim().length > 0 ||
        formColor !== DEFAULT_TAG_COLOR
      : editingTag !== null &&
        (formName !== editingTag.name ||
          formDescription !== (editingTag.description ?? '') ||
          formColor !== (editingTag.color ?? DEFAULT_TAG_COLOR));

  async function invalidateTagQueries() {
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.all });
  }

  const closeDeleteDialogs = useCallback(
    ({ restoreFocus = true } = {}) => {
      setTagPendingDelete(null);
      setTagsPendingBulkDelete([]);
      if (restoreFocus) {
        restoreFocusTarget();
      }
    },
    [restoreFocusTarget],
  );

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: async () => {
      await invalidateTagQueries();
      toast.success('Tag created.');
      closeDialog();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create tag.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTag,
    onSuccess: async () => {
      await invalidateTagQueries();
      toast.success('Tag updated.');
      closeDialog();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update tag.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tagsToDelete: Array<{ tagId: string }>) =>
      Promise.all(tagsToDelete.map((tagToDelete) => deleteTag(tagToDelete))),
    onSuccess: async (_data, variables) => {
      toast.success(variables.length === 1 ? 'Tag deleted.' : `${variables.length} tags deleted.`);
      const deletedTagIds = new Set(variables.map((item) => item.tagId));
      setSelectedTagIds((current) => current.filter((id) => !deletedTagIds.has(id)));
      closeDeleteDialogs({ restoreFocus: false });
      await invalidateTagQueries();
      restoreFocusTarget();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete tag.');
    },
  });

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (tagPendingDelete && !deleteMutation.isPending) {
        event.preventDefault();
        closeDeleteDialogs();
        return;
      }

      if (tagsPendingBulkDelete.length > 0 && !deleteMutation.isPending) {
        event.preventDefault();
        closeDeleteDialogs();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [
    closeDeleteDialogs,
    deleteMutation.isPending,
    tagPendingDelete,
    tagsPendingBulkDelete.length,
  ]);

  function toggleTagSelection(tagId: string, checked: boolean) {
    setSelectedTagIds((current) =>
      checked
        ? current.includes(tagId)
          ? current
          : [...current, tagId]
        : current.filter((id) => id !== tagId),
    );
  }

  function toggleAllVisibleTags(checked: boolean) {
    setSelectedTagIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...filteredTags.map((tag) => tag.id)]));
      }

      const visibleTagIds = new Set(filteredTags.map((tag) => tag.id));
      return current.filter((id) => !visibleTagIds.has(id));
    });
  }

  function getTagActions(tag: Tag, trigger?: HTMLButtonElement | null): TagAction[] {
    return [
      {
        key: 'edit',
        label: 'Edit',
        icon: Pencil,
        onSelect: () => openEditDialog(tag, trigger),
      },
      {
        key: 'delete',
        label: 'Delete',
        icon: Trash2,
        tone: 'destructive',
        disabled: deleteMutation.isPending,
        onSelect: () => {
          rememberFocusTarget(trigger);
          setTagPendingDelete(tag);
        },
      },
    ];
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, tag: Tag) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      tag,
      x: Math.min(event.clientX, window.innerWidth - 192),
      y: Math.min(event.clientY, window.innerHeight - 128),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: formName.trim(),
      color: formColor || null,
      description: formDescription.trim() || null,
    };
    if (dialogMode === 'edit' && selectedTag?.id) {
      await updateMutation.mutateAsync({ ...payload, tagId: selectedTag.id });
      return;
    }
    await createMutation.mutateAsync(payload);
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const tagsHeaderLeft = useMemo(
    () => (
      <HStack gap="4" minW="0" w="full">
        <WorkspacePageTitle>Tags</WorkspacePageTitle>
        <Box w="full" maxW={{ base: '16rem', md: '24rem' }}>
          <Field>
            <FieldLabel htmlFor="tag-filter" srOnly>
              Search tags
            </FieldLabel>
            <Input
              id="tag-filter"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Search tags"
              size="sm"
            />
          </Field>
        </Box>
      </HStack>
    ),
    [filterText],
  );
  const tagsHeaderActions = useMemo(
    () => (
      <CreateButton
        ref={createButtonRef}
        type="button"
        size="sm"
        onClick={(event) => openCreateDialog(event.currentTarget)}
      >
        New tag
      </CreateButton>
    ),
    [openCreateDialog],
  );
  const workspaceHeader = useMemo(
    () => ({
      left: tagsHeaderLeft,
      actions: tagsHeaderActions,
    }),
    [tagsHeaderActions, tagsHeaderLeft],
  );
  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);

  return (
    <Stack as="section" gap="0" h="full" minH="0">
      {!isInWorkspaceShell ? (
        <Flex
          as="header"
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          gap="3"
          borderBottomWidth="1px"
          borderColor="border.surface"
          bg="bg.workspace"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          {tagsHeaderLeft}
          {tagsHeaderActions}
        </Flex>
      ) : null}

      <Box flex="1" minH="0" overflowY="auto" bg="bg.workspace">
        {tagsQuery.isLoading ? (
          <Text px="6" py="6" textStyle="sm">
            Loading tags...
          </Text>
        ) : null}
        {tagsQuery.isError ? (
          <Text px="6" py="6" textStyle="sm" color="fg.error">
            Unable to load tags.
          </Text>
        ) : null}
        {!tagsQuery.isLoading && tags.length === 0 ? (
          <CenteredEmptyState
            title="No tags yet"
            description="Create the first one to start organizing documents."
            icon={<Tags size={28} />}
            containerProps={{ h: 'full', minH: '22rem', px: '6', py: '8' }}
          />
        ) : null}
        {!tagsQuery.isLoading && tags.length > 0 && filteredTags.length === 0 ? (
          <CenteredEmptyState
            title="No tags found"
            description="No tags match that search."
            icon={<Tags size={28} />}
            containerProps={{ h: 'full', minH: '22rem', px: '6', py: '8' }}
          />
        ) : null}

        {!tagsQuery.isLoading && filteredTags.length > 0 ? (
          <Stack gap="0" borderColor="border.surface">
            <Grid
              display={{ base: 'none', md: 'grid' }}
              templateColumns={TAGS_LIST_GRID_COLUMNS}
              gap="4"
              position="sticky"
              top="0"
              zIndex="1"
              borderBottomWidth="1px"
              borderColor="border.surface"
              bg="bg.workspace"
              px="6"
              py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
              fontSize="sm"
              color="fg.muted"
            >
              <SelectionCheckbox
                checked={someVisibleSelected ? 'indeterminate' : allVisibleSelected}
                label="Select all visible tags"
                onCheckedChange={toggleAllVisibleTags}
              />
              <Text as="span">Tag</Text>
              <Text as="span">Description</Text>
              <Text as="span">Documents</Text>
              <Text as="span">Created</Text>
              <Text as="span" srOnly>
                Actions
              </Text>
            </Grid>

            {filteredTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);

              return (
                <Grid
                  key={tag.id}
                  as="article"
                  alignItems="center"
                  templateColumns={{
                    base: '2.5rem minmax(0, 1fr) auto',
                    md: TAGS_LIST_GRID_COLUMNS,
                  }}
                  gap="4"
                  h="var(--arkivra-listRowHeight, 4.5rem)"
                  borderBottomWidth="1px"
                  borderColor="border.surface"
                  bg={isSelected ? 'teal.subtle' : 'bg.workspace'}
                  px="6"
                  py="var(--arkivra-rowPaddingY, 0.875rem)"
                  transition="background-color 0.15s ease"
                  _hover={{ bg: isSelected ? 'teal.subtle' : 'bg.workspaceMuted' }}
                  _last={{ borderBottomWidth: '0' }}
                  onContextMenu={(event) => openContextMenu(event, tag)}
                >
                  <SelectionCheckbox
                    checked={isSelected}
                    label={`Select ${tag.name}`}
                    onCheckedChange={(checked) => toggleTagSelection(tag.id, checked)}
                  />

                  <Flex minW="0" align="center" gap="3">
                    <Stack minW="0" flex="1" gap="1">
                      <TagBadge color={tag.color} name={tag.name} />
                      <Text
                        as="div"
                        display={{ md: 'none' }}
                        truncate
                        fontSize="sm"
                        color="fg.muted"
                      >
                        <TagDocumentsCountButton tag={tag} mobile onOpen={openDocumentsDialog} /> -{' '}
                        {formatTagCreatedDate(tag.createdAt)}
                      </Text>
                    </Stack>
                  </Flex>

                  <Text display={{ base: 'none', md: 'block' }} truncate fontSize="sm" color="fg">
                    {getTagDescription(tag)}
                  </Text>

                  <Flex display={{ base: 'none', md: 'flex' }} align="center" minW="0">
                    <TagDocumentsCountButton tag={tag} onOpen={openDocumentsDialog} />
                  </Flex>

                  <Text
                    display={{ base: 'none', md: 'block' }}
                    truncate
                    fontSize="sm"
                    color="fg.muted"
                  >
                    {formatTagCreatedDate(tag.createdAt)}
                  </Text>

                  <Box flexShrink="0">
                    <TagActionsMenu tag={tag} actions={(trigger) => getTagActions(tag, trigger)} />
                  </Box>
                </Grid>
              );
            })}
          </Stack>
        ) : null}
      </Box>

      <TagDialog
        isOpen={isDialogOpen}
        title={dialogMode === 'create' ? 'New tag' : 'Edit tag'}
        submitLabel={dialogMode === 'create' ? 'Create' : 'Save'}
        pendingLabel={dialogMode === 'create' ? 'Creating...' : 'Saving...'}
        closeLabel={dialogMode === 'create' ? 'Close create tag dialog' : 'Close edit tag dialog'}
        isPending={isSubmitting}
        isDirty={isTagDialogDirty}
        isSubmitDisabled={formName.trim().length === 0 || isSubmitting}
        nameValue={formName}
        colorValue={formColor}
        descriptionValue={formDescription}
        onNameChange={setFormName}
        onColorChange={setFormColor}
        onDescriptionChange={setFormDescription}
        onClose={closeDialog}
        onSubmit={handleSubmit}
      />

      <DeleteTagDialog
        open={tagPendingDelete !== null}
        tag={tagPendingDelete}
        isPending={deleteMutation.isPending}
        onClose={closeDeleteDialogs}
        onConfirm={() => {
          if (!tagPendingDelete) return;
          deleteMutation.mutate([
            {
              tagId: tagPendingDelete.id,
            },
          ]);
        }}
      />

      <DeleteTagsDialog
        open={tagsPendingBulkDelete.length > 0}
        tags={tagsPendingBulkDelete}
        isPending={deleteMutation.isPending}
        onClose={closeDeleteDialogs}
        onConfirm={() => {
          deleteMutation.mutate(
            tagsPendingBulkDelete.map((tag) => ({
              tagId: tag.id,
            })),
          );
        }}
      />

      <TagDocumentsDialog
        open={documentsTag !== null}
        tag={documentsTag}
        documents={tagDocumentsQuery.data?.documents ?? []}
        isLoading={tagDocumentsQuery.isLoading}
        isError={tagDocumentsQuery.isError}
        onClose={closeDocumentsDialog}
      />

      {contextMenu !== null ? (
        <TagContextMenu
          state={contextMenu}
          actions={getTagActions(contextMenu.tag)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <ActionBar.Root open={selectedTags.length > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>
                {selectedTags.length} selected
              </ActionBar.SelectionTrigger>
              <ActionBar.Separator />
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  rememberFocusTarget();
                  setTagsPendingBulkDelete(selectedTags);
                }}
              >
                Delete
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Stack>
  );
}

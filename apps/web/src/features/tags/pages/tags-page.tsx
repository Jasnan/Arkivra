import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionBar,
  Box,
  Checkbox as ChakraCheckbox,
  Flex,
  Grid,
  Stack,
  Table,
  Text,
  CloseButton,
  Dialog as ChakraDialog,
  Portal,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  PageIntro,
  SurfacePanel,
  EmptyState,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import { CreateButton, DeleteButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createTag, deleteTag, updateTag } from '@/features/tags/tags.api';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useAccessibleTagsQuery, useTagsQuery } from '@/features/tags/tags.queries';
import type { Tag } from '@/features/tags/tags.types';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

type DialogMode = 'create' | 'edit';

const DEFAULT_TAG_COLOR = '#0EA5E9';

function DeleteTagDialog({
  tag,
  isPending,
  onClose,
  onConfirm,
}: {
  tag: Tag;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const attachedDocuments = tag.documentsCount ?? 0;
  return (
    <ChakraDialog.Root open onOpenChange={(e) => { if (!e.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Delete “${tag.name}”?`}</ChakraDialog.Title>
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
                {isPending ? 'Deleting...' : 'Delete tag'}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

function DeleteTagsDialog({
  tags,
  isPending,
  onClose,
  onConfirm,
}: {
  tags: Tag[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const attachedDocuments = tags.reduce((total, tag) => total + (tag.documentsCount ?? 0), 0);

  return (
    <ChakraDialog.Root open onOpenChange={(e) => { if (!e.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
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
                <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" px="4" py="3">
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
                {isPending ? 'Deleting...' : 'Delete tags'}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

function TagActionsMenu({
  tag,
  deletePending,
  onEdit,
  onDelete,
}: {
  tag: Tag;
  deletePending: boolean;
  onEdit: (trigger: HTMLButtonElement | null) => void;
  onDelete: (trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionMenuTriggerButton
          ref={triggerRef}
          label={`Open actions for ${tag.name}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minWidth="14rem">
        <DropdownMenuItem onSelect={() => onEdit(triggerRef.current)}>
          <ActionMenuItemIcon icon={Pencil} />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={deletePending}
          color="fg.error"
          onSelect={() => onDelete(triggerRef.current)}
        >
          <ActionMenuItemIcon icon={Trash2} tone="destructive" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatTagCreatedDate(value?: string) {
  if (!value) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

function getTagDescription(tag: Tag) {
  const description = tag.description?.trim();
  return description && description.length > 0 ? description : '—';
}

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
  const params = useParams({ strict: false }) as { vaultId?: string };
  const scopedVaultId = params.vaultId;
  const isVaultScoped = scopedVaultId !== undefined && scopedVaultId.length > 0;
  const queryClient = useQueryClient();
  const vaultsQuery = useVaultsQuery();
  const scopedTagsQuery = useTagsQuery({ vaultId: scopedVaultId ?? '' });
  const accessibleTagsQuery = useAccessibleTagsQuery();

  const [filterText, setFilterText] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagPendingDelete, setTagPendingDelete] = useState<Tag | null>(null);
  const [formVaultId, setFormVaultId] = useState(scopedVaultId ?? '');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_TAG_COLOR);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagsPendingBulkDelete, setTagsPendingBulkDelete] = useState<Tag[]>([]);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreTargetRef = useRef<HTMLElement | null>(null);

  const tagsQuery = isVaultScoped ? scopedTagsQuery : accessibleTagsQuery;
  const tags = useMemo(() => tagsQuery.data?.tags ?? [], [tagsQuery.data?.tags]);
  const vaults = vaultsQuery.data?.vaults ?? [];
  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === editingTagId) ?? null,
    [editingTagId, tags],
  );

  const filteredTags = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();
    return tags.filter((tag) => {
      if (normalizedFilter.length === 0) return true;
      return [tag.name, tag.description ?? '', tag.vaultName ?? ''].some((value) =>
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

  function rememberFocusTarget(target?: HTMLElement | null) {
    focusRestoreTargetRef.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }

  function restoreFocusTarget() {
    const target = focusRestoreTargetRef.current;
    focusRestoreTargetRef.current = null;
    if (target) {
      requestAnimationFrame(() => {
        setTimeout(() => target.focus(), 80);
      });
    }
  }

  function openCreateDialog(trigger?: HTMLButtonElement | null) {
    rememberFocusTarget(trigger ?? createButtonRef.current);
    setDialogMode('create');
    setEditingTagId(null);
    setFormVaultId(scopedVaultId ?? vaults[0]?.id ?? '');
    setFormName('');
    setFormDescription('');
    setFormColor(DEFAULT_TAG_COLOR);
    setIsDialogOpen(true);
  }

  function openEditDialog(tag: Tag, trigger?: HTMLButtonElement | null) {
    rememberFocusTarget(trigger);
    setDialogMode('edit');
    setEditingTagId(tag.id);
    setFormVaultId(tag.vaultId ?? scopedVaultId ?? '');
    setFormName(tag.name);
    setFormDescription(tag.description ?? '');
    setFormColor(tag.color ?? DEFAULT_TAG_COLOR);
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setIsDialogOpen(false);
    restoreFocusTarget();
  }

  async function invalidateTagQueries(targetVaultId?: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tagQueryKeys.all }),
      targetVaultId
        ? queryClient.invalidateQueries({ queryKey: tagQueryKeys.list(targetVaultId) })
        : Promise.resolve(),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: async (_, variables) => {
      await invalidateTagQueries(variables.vaultId);
      toast.success('Tag created.');
      closeDialog();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create tag.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTag,
    onSuccess: async (_, variables) => {
      await invalidateTagQueries(variables.vaultId);
      toast.success('Tag updated.');
      closeDialog();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update tag.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tagsToDelete: Array<{ vaultId: string; tagId: string }>) =>
      Promise.all(tagsToDelete.map((tagToDelete) => deleteTag(tagToDelete))),
    onSuccess: async (_data, variables) => {
      const vaultIds = new Set(variables.map((item) => item.vaultId));
      await Promise.all(
        Array.from(vaultIds).map((vaultId) => invalidateTagQueries(vaultId)),
      );
      toast.success(
        variables.length === 1 ? 'Tag deleted.' : `${variables.length} tags deleted.`,
      );
      const deletedTagIds = new Set(variables.map((item) => item.tagId));
      setSelectedTagIds((current) => current.filter((id) => !deletedTagIds.has(id)));
      setTagPendingDelete(null);
      setTagsPendingBulkDelete([]);
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
        setTagPendingDelete(null);
        restoreFocusTarget();
        return;
      }

      if (tagsPendingBulkDelete.length > 0 && !deleteMutation.isPending) {
        event.preventDefault();
        setTagsPendingBulkDelete([]);
        restoreFocusTarget();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [deleteMutation.isPending, tagPendingDelete, tagsPendingBulkDelete.length]);

  function toggleTagSelection(tagId: string, checked: boolean) {
    setSelectedTagIds((current) => (
      checked
        ? current.includes(tagId) ? current : [...current, tagId]
        : current.filter((id) => id !== tagId)
    ));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetVaultId = (isVaultScoped ? scopedVaultId : formVaultId)?.trim() ?? '';
    if (targetVaultId.length === 0) {
      toast.error('Choose a vault before saving this tag.');
      return;
    }
    const payload = {
      vaultId: targetVaultId,
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

  if (isVaultScoped && !scopedVaultId) {
    return <Text textStyle="sm" color="fg.error">Invalid vault id.</Text>;
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Stack as="section" gap="6" pb="8">
      <PageIntro
        title="Tags"
        actions={
          <Flex flexWrap="wrap" align="center" gap="3">
            <CreateButton
              ref={createButtonRef}
              type="button"
              onClick={(event) => openCreateDialog(event.currentTarget)}
              disabled={vaultsQuery.isLoading || vaults.length === 0}
            >
              Create tag
            </CreateButton>
          </Flex>
        }
      />

      <SurfacePanel>
        <Box w="full" maxW={{ lg: '22rem' }}>
          <Field>
            <FieldLabel htmlFor="tag-filter" srOnly>
              Search tags
            </FieldLabel>
            <Input
              id="tag-filter"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Search tags"
            />
          </Field>
        </Box>
      </SurfacePanel>

      <SurfacePanel overflow="hidden" p="0">
        {tagsQuery.isLoading ? (
          <Text px="6" py="6" textStyle="sm">Loading tags...</Text>
        ) : null}
        {tagsQuery.isError ? (
          <Text px="6" py="6" textStyle="sm" color="fg.error">Unable to load tags.</Text>
        ) : null}
        {!tagsQuery.isLoading && tags.length === 0 ? (
          <Box px="6" py="8">
            <EmptyState description="No tags yet. Create the first one to start organizing documents." />
          </Box>
        ) : null}
        {!tagsQuery.isLoading && tags.length > 0 && filteredTags.length === 0 ? (
          <Box px="6" py="8">
            <EmptyState description="No tags match that search." />
          </Box>
        ) : null}

        {!tagsQuery.isLoading && filteredTags.length > 0 ? (
          <Table.ScrollArea>
            <Table.Root
              size="sm"
              variant="line"
              interactive
              css={{
                '& [data-selected]': {
                  background: 'var(--chakra-colors-bg-subtle)',
                },
              }}
            >
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader w="10">
                    <SelectionCheckbox
                      checked={someVisibleSelected ? 'indeterminate' : allVisibleSelected}
                      label="Select all visible tags"
                      onCheckedChange={toggleAllVisibleTags}
                    />
                  </Table.ColumnHeader>
                  <Table.ColumnHeader minW="180px">Tag</Table.ColumnHeader>
                  <Table.ColumnHeader minW="260px">Description</Table.ColumnHeader>
                  <Table.ColumnHeader minW="120px">Documents</Table.ColumnHeader>
                  <Table.ColumnHeader minW="170px">Vault</Table.ColumnHeader>
                  <Table.ColumnHeader minW="150px">Created</Table.ColumnHeader>
                  <Table.ColumnHeader w="20" textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);

                  return (
                    <Table.Row key={tag.id} data-selected={isSelected ? '' : undefined}>
                      <Table.Cell verticalAlign="top" w="10">
                        <SelectionCheckbox
                          checked={isSelected}
                          label={`Select ${tag.name}`}
                          onCheckedChange={(checked) => toggleTagSelection(tag.id, checked)}
                        />
                      </Table.Cell>
                      <Table.Cell verticalAlign="top">
                        <Stack gap="2">
                          <Flex w="fit-content" align="center" gap="3" rounded="full" bg="bg.subtle" px="4" py="2" fontSize="sm" fontWeight="semibold" color="fg">
                            <Box
                              aria-hidden="true"
                              boxSize="2.5"
                              rounded="full"
                              style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                            />
                            <Text as="span">{tag.name}</Text>
                          </Flex>
                          <Text display={{ md: 'none' }} fontSize="xs" color="fg.muted">
                            {tag.vaultName ?? 'Current vault'}
                          </Text>
                        </Stack>
                      </Table.Cell>
                      <Table.Cell verticalAlign="top">
                        <Text fontSize="sm" color="fg">{getTagDescription(tag)}</Text>
                      </Table.Cell>
                      <Table.Cell verticalAlign="top">
                        <Flex align="center" gap="2" fontSize="sm" color="fg">
                          <FileText size={16} color="var(--chakra-colors-fg-muted)" />
                          <Text as="span">{tag.documentsCount ?? 0}</Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell verticalAlign="top">
                        <Text fontSize="sm" color="fg.muted">
                          {tag.vaultName ?? 'Current vault'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell verticalAlign="top">
                        <Text fontSize="sm" color="fg.muted">{formatTagCreatedDate(tag.createdAt)}</Text>
                      </Table.Cell>
                      <Table.Cell verticalAlign="top" textAlign="right">
                        <Flex align="center" justify="flex-end" gap="2">
                          <TagActionsMenu
                            tag={tag}
                            deletePending={deleteMutation.isPending}
                            onEdit={(trigger) => openEditDialog(tag, trigger)}
                            onDelete={(trigger) => {
                              rememberFocusTarget(trigger);
                              setTagPendingDelete(tag);
                            }}
                          />
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>
        ) : null}
      </SurfacePanel>

      <TagDialog
        isOpen={isDialogOpen}
        title={dialogMode === 'create' ? 'Create tag' : 'Edit tag'}
        submitLabel={dialogMode === 'create' ? 'Create tag' : 'Save changes'}
        pendingLabel={dialogMode === 'create' ? 'Creating...' : 'Saving...'}
        closeLabel={dialogMode === 'create' ? 'Close create tag dialog' : 'Close edit tag dialog'}
        extraFields={
          !isVaultScoped ? (
            <Field gap="3">
              <FieldLabel id="tag-dialog-vault-label">Vault</FieldLabel>
              <Select
                value={formVaultId || '__none__'}
                onValueChange={(value) => setFormVaultId(value === '__none__' ? '' : value)}
              >
                <SelectTrigger
                  aria-labelledby="tag-dialog-vault-label"
                  className={vaultInputClassName}
                  h="10"
                  rounded="lg"
                  fontSize="sm"
                >
                  <SelectValue placeholder="Choose a vault" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose a vault</SelectItem>
                  {vaults.map((vault) => (
                    <SelectItem key={vault.id} value={vault.id}>
                      {vault.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null
        }
        isPending={isSubmitting}
        isSubmitDisabled={
          formName.trim().length === 0 ||
          (!isVaultScoped && formVaultId.trim().length === 0) ||
          isSubmitting
        }
        nameValue={formName}
        colorValue={formColor}
        descriptionValue={formDescription}
        onNameChange={setFormName}
        onColorChange={setFormColor}
        onDescriptionChange={setFormDescription}
        onClose={closeDialog}
        onSubmit={handleSubmit}
      />

      {tagPendingDelete ? (
        <DeleteTagDialog
          tag={tagPendingDelete}
          isPending={deleteMutation.isPending}
          onClose={() => {
            setTagPendingDelete(null);
            restoreFocusTarget();
          }}
          onConfirm={() => {
            deleteMutation.mutate([{
              vaultId: tagPendingDelete.vaultId ?? scopedVaultId ?? '',
              tagId: tagPendingDelete.id,
            }]);
          }}
        />
      ) : null}

      {tagsPendingBulkDelete.length > 0 ? (
        <DeleteTagsDialog
          tags={tagsPendingBulkDelete}
          isPending={deleteMutation.isPending}
          onClose={() => {
            setTagsPendingBulkDelete([]);
            restoreFocusTarget();
          }}
          onConfirm={() => {
            deleteMutation.mutate(
              tagsPendingBulkDelete.map((tag) => ({
                vaultId: tag.vaultId ?? scopedVaultId ?? '',
                tagId: tag.id,
              })),
            );
          }}
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
                Delete selected
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Stack>
  );
}

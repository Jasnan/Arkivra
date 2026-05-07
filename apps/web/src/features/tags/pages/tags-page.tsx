import type { FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, Stack, Text, CloseButton, Dialog as ChakraDialog, Portal } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
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
              <Text color="text.muted" fontSize="sm">
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
          color="status.danger"
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

export function TagsPage() {
  const params = useParams<{ vaultId: string }>();
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

  function rememberFocusTarget(target?: HTMLElement | null) {
    focusRestoreTargetRef.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }

  function restoreFocusTarget() {
    const target = focusRestoreTargetRef.current;
    focusRestoreTargetRef.current = null;
    if (target) {
      requestAnimationFrame(() => target.focus());
    }
  }

  function openCreateDialog() {
    rememberFocusTarget(createButtonRef.current);
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
    mutationFn: deleteTag,
    onSuccess: async (_, variables) => {
      await invalidateTagQueries(variables.vaultId);
      toast.success('Tag deleted.');
      setTagPendingDelete(null);
      restoreFocusTarget();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete tag.');
    },
  });

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
    return <Text textStyle="metadata" color="status.danger">Invalid vault id.</Text>;
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
              onClick={openCreateDialog}
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
        <Grid
          display={{ base: 'none', md: 'grid' }}
          templateColumns="180px minmax(0, 1.4fr) 140px 170px 150px 130px"
          gap="6"
          px="6"
          py="4"
          fontSize="sm"
          fontWeight="medium"
          color="text.muted"
        >
          <Text as="span">Tag</Text>
          <Text as="span">Description</Text>
          <Text as="span">Documents</Text>
          <Text as="span">Vault</Text>
          <Text as="span">Created</Text>
          <Text as="span" textAlign="right">Actions</Text>
        </Grid>

        {tagsQuery.isLoading ? (
          <Text px="6" py="6" textStyle="metadata">Loading tags...</Text>
        ) : null}
        {tagsQuery.isError ? (
          <Text px="6" py="6" textStyle="metadata" color="status.danger">Unable to load tags.</Text>
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

        <Stack gap="0" divideY="1px" divideColor="border.subtle">
          {filteredTags.map((tag) => (
            <Grid
              as="article"
              key={tag.id}
              gap={{ base: '4', md: '6' }}
              px="6"
              py="5"
              templateColumns={{ base: '1fr', md: '180px minmax(0, 1.4fr) 140px 170px 150px 130px' }}
              alignItems={{ md: 'center' }}
            >
              <Stack gap="2">
                <Flex w="fit-content" align="center" gap="3" rounded="full" bg="surface.subtle" px="4" py="2" fontSize="sm" fontWeight="semibold" color="text.default">
                  <Box
                    aria-hidden="true"
                    boxSize="2.5"
                    rounded="full"
                    style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                  />
                  <Text as="span">{tag.name}</Text>
                </Flex>
                <Text display={{ md: 'none' }} fontSize="xs" color="text.muted">
                  {tag.vaultName ?? 'Current vault'}
                </Text>
              </Stack>

              <Text fontSize="sm" color="text.default">{getTagDescription(tag)}</Text>

              <Flex align="center" gap="2" fontSize="sm" color="text.default">
                <FileText size={16} color="var(--chakra-colors-text-muted)" />
                <Text as="span">{tag.documentsCount ?? 0}</Text>
              </Flex>

              <Text fontSize="sm" color="text.muted">
                {tag.vaultName ?? 'Current vault'}
              </Text>

              <Text fontSize="sm" color="text.muted">{formatTagCreatedDate(tag.createdAt)}</Text>

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
            </Grid>
          ))}
        </Stack>
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
            deleteMutation.mutate({
              vaultId: tagPendingDelete.vaultId ?? scopedVaultId ?? '',
              tagId: tagPendingDelete.id,
            });
          }}
        />
      ) : null}
    </Stack>
  );
}

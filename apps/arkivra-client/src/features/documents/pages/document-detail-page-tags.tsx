import { Box, Flex, IconButton, Text, chakra } from '@chakra-ui/react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TagBadge } from '@/features/tags/components/tag-badge';
import type { Tag } from '@/features/tags/tags.types';

export function DocumentDetailTagControls({
  assignedTags,
  availableTags,
  selectedTags,
  isTrashDocumentRoute,
  isTagPickerOpen,
  tagSearchValue,
  normalizedTagSearchValue,
  hasExactTagMatch,
  historicalVersionLabel,
  onAssignTag,
  onOpenChange,
  onOpenCreateTagDialog,
  onRemoveTag,
  onSearchValueChange,
}: {
  assignedTags: Tag[];
  availableTags: Tag[];
  selectedTags: Tag[];
  isTrashDocumentRoute: boolean;
  isTagPickerOpen: boolean;
  tagSearchValue: string;
  normalizedTagSearchValue: string;
  hasExactTagMatch: boolean;
  historicalVersionLabel: string | null;
  onAssignTag: (tagId: string) => void;
  onOpenChange: (open: boolean) => void;
  onOpenCreateTagDialog: (name: string) => void;
  onRemoveTag: (tagId: string) => void;
  onSearchValueChange: (value: string) => void;
}) {
  return (
    <Flex flexWrap="wrap" align="center" gap="2" minW="0">
      {historicalVersionLabel ? (
        <Flex
          align="center"
          rounded="full"
          borderWidth="1px"
          borderColor="orange.muted"
          bg="orange.subtle"
          px="3"
          py="1"
          fontSize="xs"
          fontWeight="semibold"
          color="orange.fg"
        >
          {historicalVersionLabel}
        </Flex>
      ) : null}
      {assignedTags.map((tag) => (
        <TagBadge
          key={tag.id}
          color={tag.color}
          name={tag.name}
          onRemove={!isTrashDocumentRoute ? () => onRemoveTag(tag.id) : undefined}
        />
      ))}
      {!isTrashDocumentRoute ? (
        <DropdownMenu modal={false} open={isTagPickerOpen} onOpenChange={onOpenChange}>
          <DropdownMenuTrigger asChild>
            {assignedTags.length === 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                borderStyle="dashed"
                color="fg.muted"
                _hover={{ bg: 'bg.surface', color: 'fg' }}
              >
                <Plus size={12} />
                Add tag
              </Button>
            ) : (
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Add tag"
                borderStyle="dashed"
                color="fg.muted"
                _hover={{ bg: 'bg.surface', color: 'fg' }}
              >
                <Plus size={8} />
              </IconButton>
            )}
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
            <Box borderBottomWidth="1px" borderColor="border.surface" p="2">
              <Field>
                <FieldLabel htmlFor="document-detail-tag-filter" srOnly>
                  Filter tags
                </FieldLabel>
                <Input
                  id="document-detail-tag-filter"
                  type="text"
                  value={tagSearchValue}
                  onChange={(event) => onSearchValueChange(event.target.value)}
                  placeholder="Filter tags..."
                  size="md"
                  borderColor="transparent"
                  focusRing="none"
                  autoFocus
                />
              </Field>
            </Box>
            <Box maxH="72" overflowY="auto" overflowX="hidden" py="1">
              {selectedTags.map((tag) => (
                <TagPickerItem
                  key={tag.id}
                  tag={tag}
                  selected
                  onClick={() => onRemoveTag(tag.id)}
                />
              ))}
              {selectedTags.length > 0 && availableTags.length > 0 ? (
                <DropdownMenuSeparator />
              ) : null}
              {availableTags.map((tag) => (
                <TagPickerItem key={tag.id} tag={tag} onClick={() => onAssignTag(tag.id)} />
              ))}
              {normalizedTagSearchValue.length > 0 && !hasExactTagMatch ? (
                <DropdownMenuItem onSelect={() => onOpenCreateTagDialog(tagSearchValue.trim())}>
                  <Plus size={16} />
                  <Text flex="1" minW="0" truncate>{`New tag "${tagSearchValue.trim()}"`}</Text>
                </DropdownMenuItem>
              ) : null}
              {selectedTags.length === 0 && availableTags.length === 0 ? (
                normalizedTagSearchValue.length === 0 ? (
                  <Text px="4" py="3" fontSize="sm" color="fg.muted">
                    All tags are already assigned.
                  </Text>
                ) : !hasExactTagMatch ? null : (
                  <Text px="4" py="3" fontSize="sm" color="fg.muted">
                    No matching tags.
                  </Text>
                )
              ) : null}
            </Box>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </Flex>
  );
}

function TagPickerItem({
  tag,
  selected = false,
  onClick,
}: {
  tag: Tag;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <chakra.button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected ? 'true' : 'false'}
      display="flex"
      w="full"
      alignItems="center"
      gap="3"
      px="4"
      py="2.5"
      textAlign="left"
      color="fg"
      _hover={{ bg: 'bg.subtle' }}
      _focusVisible={{
        outline: '2px solid',
        outlineColor: 'teal.solid',
        outlineOffset: '-2px',
      }}
      onClick={onClick}
    >
      {selected ? (
        <Flex
          aria-hidden="true"
          boxSize="6"
          flexShrink={0}
          align="center"
          justify="center"
          rounded="md"
          bg="#D8FF75"
          color="#111827"
        >
          <Check size={17} strokeWidth={2.4} />
        </Flex>
      ) : (
        <Box aria-hidden="true" boxSize="6" flexShrink={0} />
      )}
      <Box
        aria-hidden="true"
        boxSize="2.5"
        flexShrink={0}
        rounded="full"
        bg={tag.color ?? '#64748b'}
      />
      <Text flex="1" minW="0" fontWeight="semibold" color="fg" truncate>
        {tag.name}
      </Text>
    </chakra.button>
  );
}

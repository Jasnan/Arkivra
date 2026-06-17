import type { FormEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Plus, RefreshCw, Save, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TagBadge } from './tag-badge';

const DEFAULT_TAG_COLORS = [
  '#D8FF75',
  '#7FFF7A',
  '#7AFFCE',
  '#7AD7FF',
  '#7A7FFF',
  '#CE7AFF',
  '#FF7AD7',
  '#FF7A7F',
  '#FFCE7A',
  '#FFFFFF',
];

export function TagDialog({
  isOpen,
  title,
  submitLabel,
  pendingLabel,
  closeLabel,
  extraFields,
  isPending,
  isDirty,
  isSubmitDisabled,
  nameValue,
  colorValue,
  descriptionValue,
  onNameChange,
  onColorChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  pendingLabel: string;
  closeLabel: string;
  extraFields?: ReactNode;
  isPending: boolean;
  isDirty: boolean;
  isSubmitDisabled: boolean;
  nameValue: string;
  colorValue: string;
  descriptionValue: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const customColorInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedName = nameValue.trim();
  const canDismissDialog = !isDirty && !isPending;
  const isCreateMode = submitLabel.toLowerCase().includes('create');
  const description = isCreateMode
    ? 'Create consistent labels for organizing documents.'
    : 'Update this label while preserving document organization.';

  return (
    <ChakraDialog.Root open={isOpen} closeOnEscape={canDismissDialog} closeOnInteractOutside={canDismissDialog} onOpenChange={(e) => { if (!e.open && !isPending) onClose(); }}>
      <Portal>
        <ChakraDialog.Backdrop position="fixed" inset="0" zIndex="modal" backdropFilter="blur(4px)" bg="rgba(11, 13, 18, 0.65)" />
        <ChakraDialog.Positioner position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center" px="4" py="8">
          <ChakraDialog.Content
            position="relative"
            zIndex="modal"
            w="calc(100vw - 2rem)"
            maxW="40rem"
            overflow="hidden"
            rounded="xl"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.modalHeader"
            shadow="lg"
          >
            <chakra.form onSubmit={onSubmit}>
              <Box
                borderBottomWidth="1px"
                borderColor="border.divider"
                bg="bg.modalHeader"
                px={{ base: '5', sm: '6' }}
                py={{ base: '4.5', sm: '5' }}
                pr={{ base: '14', lg: '16' }}
              >
                <ChakraDialog.Header display="flex" flexDirection="column" gap="2" p="0">
                  <HStack gap="3" align="center">
                    <Flex boxSize="10" align="center" justify="center" rounded="lg" bg="teal.subtle" color="teal.fg" flexShrink="0">
                      <TagIcon size={18} />
                    </Flex>
                    <Stack gap="0.5" minW="0">
                      <ChakraDialog.Title fontSize="lg" fontWeight="semibold" lineHeight="1.25" color="fg">{title}</ChakraDialog.Title>
                      <ChakraDialog.Description fontSize="sm" lineHeight="1.55" color="fg.muted">
                        {description}
                      </ChakraDialog.Description>
                    </Stack>
                  </HStack>
                  <ChakraDialog.CloseTrigger asChild>
                    <CloseButton
                      aria-label={closeLabel}
                      position="absolute"
                      top="5"
                      right="5"
                      size="sm"
                      rounded="lg"
                      color="fg.muted"
                      _hover={{ bg: 'bg.modalField', color: 'fg' }}
                      _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
                    />
                  </ChakraDialog.CloseTrigger>
                </ChakraDialog.Header>
              </Box>

              <Stack
                gap="5"
                px={{ base: '5', sm: '6' }}
                py={{ base: '5', sm: '6' }}
                bg="bg.modalContent"
              >
                <Field gap="2.5">
                  <FieldLabel htmlFor="tag-dialog-name">Name</FieldLabel>
                  <Input
                    id="tag-dialog-name"
                    type="text"
                    required
                    autoFocus
                    maxLength={64}
                    value={nameValue}
                    placeholder="Tag name"
                    size="lg"
                    rounded="lg"
                    bg="bg.modalField"
                    borderColor="border.surface"
                    _hover={{ borderColor: 'border.strong' }}
                    _focusVisible={{ borderColor: 'teal.solid', boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)' }}
                    onChange={(event) => onNameChange(event.target.value)}
                  />
                </Field>

                {extraFields}

                <Field gap="2.5">
                  <FieldLabel>Color</FieldLabel>
                  <Flex flexWrap="wrap" align="center" gap="2.5">
                    {DEFAULT_TAG_COLORS.map((color) => (
                      <chakra.button
                        key={color}
                        type="button"
                        aria-label={`Select color ${color}`}
                        aria-pressed={colorValue === color}
                        display="flex"
                        boxSize="10"
                        alignItems="center"
                        justifyContent="center"
                        rounded="xl"
                        borderWidth="1px"
                        borderColor={colorValue === color ? 'fg/35' : 'border.surface'}
                        ring={colorValue === color ? '2px' : undefined}
                        ringColor={colorValue === color ? 'fg/10' : undefined}
                        style={{ backgroundColor: color }}
                        cursor="pointer"
                        _hover={colorValue !== color ? { borderColor: 'fg/20' } : undefined}
                        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
                        onClick={() => onColorChange(color)}
                      >
                        {colorValue === color ? (
                          <Box boxSize="2.5" rounded="full" bg={color === '#FFFFFF' ? 'fg' : 'blackAlpha.700'} />
                        ) : null}
                      </chakra.button>
                    ))}
                    <chakra.button type="button" aria-label="Choose custom color" display="inline-flex" boxSize="10" alignItems="center" justifyContent="center" rounded="xl" borderWidth="1px" borderColor="border.surface" bg="bg.modalField" color="fg" cursor="pointer" _hover={{ borderColor: 'fg/20' }} _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }} onClick={() => customColorInputRef.current?.click()}>
                      <Plus size={20} />
                    </chakra.button>
                    <chakra.button type="button" aria-label="Reset tag color" display="inline-flex" boxSize="10" alignItems="center" justifyContent="center" rounded="xl" color="fg.muted" cursor="pointer" _hover={{ bg: 'teal.subtle', color: 'fg' }} _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }} onClick={() => onColorChange('#D8FF75')}>
                      <RefreshCw size={20} />
                    </chakra.button>
                    <input ref={customColorInputRef} type="color" value={colorValue} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }} onChange={(event) => onColorChange(event.target.value.toUpperCase())} />
                  </Flex>
                </Field>

                <Field gap="2.5">
                  <FieldLabel htmlFor="tag-dialog-description">
                    Description <Text as="span" fontWeight="normal" color="fg.muted">(optional)</Text>
                  </FieldLabel>
                  <Textarea
                    id="tag-dialog-description"
                    maxLength={256}
                    value={descriptionValue}
                    minH="7rem"
                    resize="vertical"
                    placeholder="Eg. All the contracts signed by the company"
                    rounded="lg"
                    bg="bg.modalField"
                    borderColor="border.surface"
                    _hover={{ borderColor: 'border.strong' }}
                    _focusVisible={{ borderColor: 'teal.solid', boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)' }}
                    onChange={(event) => onDescriptionChange(event.target.value)}
                  />
                </Field>

                <HStack gap="2.5" align="center" color="fg.muted">
                  <Text textStyle="sm">Preview</Text>
                  <TagBadge color={colorValue} name={normalizedName || 'New tag'} />
                </HStack>
              </Stack>

              <Box
                borderTopWidth="1px"
                borderColor="border.divider"
                bg="bg.modalFooter"
                px={{ base: '5', sm: '6' }}
                py={{ base: '4', sm: '4.5' }}
              >
                <Flex align="center" justify="space-between" gap="4" w="full">
                  <ChakraDialog.ActionTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      rounded="lg"
                      borderColor="border.strong"
                      bg="transparent"
                      _hover={{ bg: 'bg.modalField', borderColor: 'fg/30' }}
                      onClick={onClose}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  {isCreateMode ? (
                    <Button type="submit" size="lg" rounded="lg" colorPalette="teal" disabled={isSubmitDisabled}>
                      <Plus size={18} />
                      {isPending ? pendingLabel : submitLabel}
                    </Button>
                  ) : (
                    <Button type="submit" size="lg" rounded="lg" colorPalette="teal" disabled={isSubmitDisabled}>
                      <Save size={18} />
                      {isPending ? pendingLabel : submitLabel}
                    </Button>
                  )}
                </Flex>
              </Box>
            </chakra.form>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

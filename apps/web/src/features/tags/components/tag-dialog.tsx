import type { FormEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { Box, Flex, Text, CloseButton, Dialog as ChakraDialog, Portal, chakra } from '@chakra-ui/react';
import { Plus, RefreshCw } from 'lucide-react';
import { CreateButton, SaveButton } from '@/components/ui/action-buttons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
  closeLabel: _closeLabel,
  extraFields,
  isPending,
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

  return (
    <ChakraDialog.Root open={isOpen} onOpenChange={(e) => { if (!e.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <chakra.form id="tag-dialog-form" display="flex" flexDirection="column" gap="6" onSubmit={onSubmit}>
                <Field gap="3">
                  <FieldLabel htmlFor="tag-dialog-name">Name</FieldLabel>
                  <Input id="tag-dialog-name" type="text" required autoFocus maxLength={64} value={nameValue} onChange={(event) => onNameChange(event.target.value)} placeholder="Tag name" />
                </Field>

                {extraFields}

                <Field gap="3">
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
                        borderColor={colorValue === color ? 'fg/35' : 'border.subtle'}
                        ring={colorValue === color ? '2px' : undefined}
                        ringColor={colorValue === color ? 'fg/10' : undefined}
                        style={{ backgroundColor: color }}
                        cursor="pointer"
                        _hover={colorValue !== color ? { borderColor: 'fg/20' } : undefined}
                        onClick={() => onColorChange(color)}
                      >
                        {colorValue === color ? (
                          <Box boxSize="2.5" rounded="full" bg={color === '#FFFFFF' ? 'fg' : 'blackAlpha.700'} />
                        ) : null}
                      </chakra.button>
                    ))}
                    <chakra.button type="button" aria-label="Choose custom color" display="inline-flex" boxSize="10" alignItems="center" justifyContent="center" rounded="xl" borderWidth="1px" borderColor="border.subtle" bg="bg.panel" color="fg" cursor="pointer" _hover={{ borderColor: 'fg/20' }} onClick={() => customColorInputRef.current?.click()}>
                      <Plus size={20} />
                    </chakra.button>
                    <chakra.button type="button" aria-label="Reset tag color" display="inline-flex" boxSize="10" alignItems="center" justifyContent="center" rounded="xl" color="fg.muted" cursor="pointer" _hover={{ bg: 'teal.subtle', color: 'fg' }} onClick={() => onColorChange('#D8FF75')}>
                      <RefreshCw size={20} />
                    </chakra.button>
                    <input ref={customColorInputRef} type="color" value={colorValue} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }} onChange={(event) => onColorChange(event.target.value.toUpperCase())} />
                  </Flex>
                </Field>

                <Field gap="3">
                  <FieldLabel htmlFor="tag-dialog-description">
                    Description <Text as="span" fontWeight="normal" color="fg.muted">(optional)</Text>
                  </FieldLabel>
                  <Textarea id="tag-dialog-description" maxLength={256} value={descriptionValue} onChange={(event) => onDescriptionChange(event.target.value)} minH="7rem" resize="vertical" placeholder="Eg. All the contracts signed by the company" />
                </Field>
              </chakra.form>
            </ChakraDialog.Body>
            <ChakraDialog.Footer justifyContent="space-between">
              <Badge variant="secondary" display="flex" alignItems="center" gap="2" rounded="lg" px="2.5" py="1" fontSize="sm" lineHeight="none">
                <Box aria-hidden="true" boxSize="1.5" rounded="full" style={{ backgroundColor: colorValue }} />
                <Text as="span">{normalizedName || 'New tag'}</Text>
              </Badge>
              <Flex gap="3">
                <ChakraDialog.ActionTrigger asChild>
                  <Button variant="outline" onClick={onClose} disabled={isPending}>
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                {submitLabel.toLowerCase().includes('create') ? (
                  <CreateButton type="button" disabled={isSubmitDisabled} onClick={() => { (document.getElementById('tag-dialog-form') as HTMLFormElement)?.requestSubmit(); }}>
                    {isPending ? pendingLabel : submitLabel}
                  </CreateButton>
                ) : (
                  <SaveButton type="button" disabled={isSubmitDisabled} onClick={() => { (document.getElementById('tag-dialog-form') as HTMLFormElement)?.requestSubmit(); }}>
                    {isPending ? pendingLabel : submitLabel}
                  </SaveButton>
                )}
              </Flex>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

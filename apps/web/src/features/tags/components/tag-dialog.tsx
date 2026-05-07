import type { FormEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { CreateButton, SaveButton } from '@/components/ui/action-buttons';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  closeLabel,
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        maxWidth="48rem"
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <Flex align="flex-start" justify="space-between" gap="4" px={{ base: '6', sm: '8' }} pt={{ base: '6', sm: '7' }}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}>{title}</DialogDescription>
          </DialogHeader>
          <chakra.button
            type="button"
            aria-label={closeLabel}
            display="inline-flex"
            boxSize="9"
            alignItems="center"
            justifyContent="center"
            rounded="full"
            color="text.muted"
            cursor="pointer"
            _hover={{ bg: 'surface.selected', color: 'text.default' }}
            onClick={onClose}
            disabled={isPending}
          >
            <X size={20} />
          </chakra.button>
        </Flex>

        <chakra.form
          display="flex"
          flexDirection="column"
          gap="6"
          px={{ base: '6', sm: '8' }}
          pb={{ base: '6', sm: '8' }}
          pt="5"
          onSubmit={onSubmit}
        >
          <Field gap="3">
            <FieldLabel htmlFor="tag-dialog-name">Name</FieldLabel>
            <Input
              id="tag-dialog-name"
              type="text"
              required
              autoFocus
              maxLength={64}
              value={nameValue}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Tag name"
            />
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
                  borderColor={colorValue === color ? 'text.default/35' : 'border.subtle'}
                  ring={colorValue === color ? '2px' : undefined}
                  ringColor={colorValue === color ? 'text.default/10' : undefined}
                  style={{ backgroundColor: color }}
                  cursor="pointer"
                  _hover={colorValue !== color ? { borderColor: 'text.default/20' } : undefined}
                  onClick={() => onColorChange(color)}
                >
                  {colorValue === color ? (
                    <Box
                      boxSize="2.5"
                      rounded="full"
                      bg={color === '#FFFFFF' ? 'text.default' : 'blackAlpha.700'}
                    />
                  ) : null}
                </chakra.button>
              ))}
              <chakra.button
                type="button"
                aria-label="Choose custom color"
                display="inline-flex"
                boxSize="10"
                alignItems="center"
                justifyContent="center"
                rounded="xl"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="surface.default"
                color="text.default"
                cursor="pointer"
                _hover={{ borderColor: 'text.default/20' }}
                onClick={() => customColorInputRef.current?.click()}
              >
                <Plus size={20} />
              </chakra.button>
              <chakra.button
                type="button"
                aria-label="Reset tag color"
                display="inline-flex"
                boxSize="10"
                alignItems="center"
                justifyContent="center"
                rounded="xl"
                color="text.muted"
                cursor="pointer"
                _hover={{ bg: 'surface.selected', color: 'text.default' }}
                onClick={() => onColorChange('#D8FF75')}
              >
                <RefreshCw size={20} />
              </chakra.button>
              <input
                ref={customColorInputRef}
                type="color"
                value={colorValue}
                style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}
                onChange={(event) => onColorChange(event.target.value.toUpperCase())}
              />
            </Flex>
          </Field>

          <Field gap="3">
            <FieldLabel htmlFor="tag-dialog-description">
              Description <Text as="span" fontWeight="normal" color="text.muted">(optional)</Text>
            </FieldLabel>
            <Textarea
              id="tag-dialog-description"
              maxLength={256}
              value={descriptionValue}
              onChange={(event) => onDescriptionChange(event.target.value)}
              minH="7rem"
              resize="vertical"
              placeholder="Eg. All the contracts signed by the company"
            />
          </Field>

          <Flex align="center" justify="space-between" gap="4" pt="2" flexWrap="wrap">
            <Badge
              variant="secondary"
              display="flex"
              alignItems="center"
              gap="2"
              rounded="lg"
              px="2.5"
              py="1"
              fontSize="sm"
              lineHeight="none"
            >
              <Box
                aria-hidden="true"
                boxSize="1.5"
                rounded="full"
                style={{ backgroundColor: colorValue }}
              />
              <Text as="span">{normalizedName || 'New tag'}</Text>
            </Badge>
            {submitLabel.toLowerCase().includes('create') ? (
              <CreateButton type="submit" px="5" disabled={isSubmitDisabled}>
                {isPending ? pendingLabel : submitLabel}
              </CreateButton>
            ) : (
              <SaveButton type="submit" px="5" disabled={isSubmitDisabled}>
                {isPending ? pendingLabel : submitLabel}
              </SaveButton>
            )}
          </Flex>
        </chakra.form>
      </DialogContent>
    </Dialog>
  );
}

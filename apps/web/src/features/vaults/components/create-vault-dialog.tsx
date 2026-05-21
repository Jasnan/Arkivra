import type { FormEvent, ReactNode } from 'react';
import { Box, Flex, HStack, Stack, Text, Textarea, chakra } from '@chakra-ui/react';
import { Info, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface CreateVaultDialogProps {
  open: boolean;
  closeOnEscape: boolean;
  closeOnInteractOutside: boolean;
  name: string;
  description: string;
  canCreateVault: boolean;
  isPending: boolean;
  icon: ReactNode;
  nameInputId: string;
  descriptionInputId: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  finalFocusEl?: () => HTMLElement | null;
  onExitComplete?: () => void;
}

export function CreateVaultDialog({
  open,
  closeOnEscape,
  closeOnInteractOutside,
  name,
  description,
  canCreateVault,
  isPending,
  icon,
  nameInputId,
  descriptionInputId,
  onOpenChange,
  onSubmit,
  onCancel,
  onNameChange,
  onDescriptionChange,
  finalFocusEl,
  onExitComplete,
}: CreateVaultDialogProps) {
  return (
    <Dialog
      open={open}
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
      finalFocusEl={finalFocusEl}
      onExitComplete={onExitComplete}
      onOpenChange={onOpenChange}
    >
      <DialogContent maxW="40rem" w="calc(100vw - 2rem)" bg="bg.modalHeader" p="0" rounded="xl" shadow="lg">
        <chakra.form onSubmit={onSubmit}>
          <Box
            borderBottomWidth="1px"
            borderColor="border.divider"
            bg="bg.modalHeader"
            px={{ base: '5', sm: '6' }}
            py={{ base: '4.5', sm: '5' }}
            pr={{ base: '14', lg: '16' }}
          >
            <DialogHeader p="0">
              <HStack gap="3" align="center">
                <Flex boxSize="10" align="center" justify="center" rounded="lg" bg="teal.subtle" color="teal.fg" flexShrink="0">
                  {icon}
                </Flex>
                <Stack gap="0.5" minW="0">
                  <DialogTitle fontSize="lg" lineHeight="1.25">New vault</DialogTitle>
                  <DialogDescription>
                    Create a new vault for organizing documents and access.
                  </DialogDescription>
                </Stack>
              </HStack>
            </DialogHeader>
          </Box>

          <Stack
            gap="5"
            px={{ base: '5', sm: '6' }}
            py={{ base: '5', sm: '6' }}
            bg="bg.modalContent"
          >
            <Stack gap="4.5">
              <Field>
                <FieldLabel htmlFor={nameInputId}>Vault name</FieldLabel>
                <Input
                  id={nameInputId}
                  type="text"
                  required
                  autoFocus
                  value={name}
                  placeholder="Personal Vault"
                  h="12"
                  rounded="lg"
                  bg="bg.modalField"
                  borderColor="border.surface"
                  _hover={{ borderColor: 'border.strong' }}
                  _focusVisible={{ borderColor: 'teal.solid', boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)' }}
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={descriptionInputId}>Description (optional)</FieldLabel>
                <Textarea
                  id={descriptionInputId}
                  value={description}
                  minH="7rem"
                  resize="vertical"
                  placeholder="Optional"
                  rounded="lg"
                  bg="bg.modalField"
                  borderColor="border.surface"
                  _hover={{ borderColor: 'border.strong' }}
                  _focusVisible={{ borderColor: 'teal.solid', boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)' }}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                />
              </Field>

              {canCreateVault ? null : (
                <Text fontSize="sm" color="fg.muted">
                  Vault creation will be queued for admin approval.
                </Text>
              )}
            </Stack>

            <HStack gap="2.5" align="start" color="fg.muted">
              <Box mt="0.5" flexShrink="0" color="fg.subtle">
                <Info size={16} />
              </Box>
              <Text textStyle="sm">
                Vault permissions and member access can be configured after creation.
              </Text>
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
              <Button
                type="button"
                variant="outline"
                h="12"
                px="6"
                rounded="lg"
                borderColor="border.strong"
                bg="transparent"
                _hover={{ bg: 'bg.modalField', borderColor: 'fg/30' }}
                disabled={isPending}
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button type="submit" h="12" px="6" rounded="lg" colorPalette="teal" disabled={isPending}>
                <Plus size={18} />
                {isPending ? 'Submitting...' : canCreateVault ? 'Create' : 'Request'}
              </Button>
            </Flex>
          </Box>
        </chakra.form>
      </DialogContent>
    </Dialog>
  );
}

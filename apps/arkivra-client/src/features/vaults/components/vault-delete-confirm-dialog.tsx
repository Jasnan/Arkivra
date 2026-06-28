import { type FormEvent, useEffect, useId, useState } from 'react';
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
import {
  AlertTriangle,
  BrainCircuit,
  Database,
  FileText,
  Folder,
  Layers3,
  Puzzle,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react';
import { DeleteButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';

type VaultDeleteConfirmDialogVault = {
  id: string;
  name: string;
};

const deletedResources = [
  { label: 'All folders', icon: Folder },
  { label: 'All documents', icon: FileText },
  { label: 'All document versions', icon: Layers3 },
  { label: 'Parsed content', icon: FileText },
  { label: 'AI indexes and embeddings', icon: BrainCircuit },
  { label: 'Tags', icon: Tag },
  { label: 'Permissions', icon: ShieldCheck },
  { label: 'Metadata', icon: Database },
  { label: 'Every other resource owned by this vault', icon: Puzzle },
];

export function VaultDeleteConfirmDialog({
  open,
  vault,
  isPending,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  vault: VaultDeleteConfirmDialogVault | null;
  isPending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const inputId = useId();
  const [confirmation, setConfirmation] = useState('');
  const isValid = vault !== null && confirmation === vault.name;

  useDialogPageLockCleanup(open);

  useEffect(() => {
    if (!open) {
      setConfirmation('');
    }
  }, [open, vault?.id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || isPending) {
      return;
    }

    onConfirm();
  }

  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open && !isPending) onCancel();
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content maxW="4xl" overflow="hidden">
            <chakra.form onSubmit={handleSubmit}>
              <ChakraDialog.Header alignItems="center" gap="4" px={{ base: '5', md: '8' }} pt={{ base: '5', md: '7' }}>
                <Flex
                  boxSize="11"
                  shrink="0"
                  align="center"
                  justify="center"
                  rounded="lg"
                  bg="red.subtle"
                  color="red.fg"
                >
                  <Trash2 size={22} />
                </Flex>
                <ChakraDialog.Title flex="1" fontSize={{ base: 'xl', md: '2xl' }} color="teal.fg">
                  Delete vault
                </ChakraDialog.Title>
                <CloseButton size="sm" disabled={isPending} onClick={onCancel} />
              </ChakraDialog.Header>
              <ChakraDialog.Body px={{ base: '5', md: '8' }} py="6">
                <Stack gap="7" color="fg.muted" fontSize="sm" lineHeight="1.55">
                  <Stack gap="5">
                    <Text fontSize="md" fontWeight="medium" color="fg">
                      This will permanently delete the following and everything else owned by this vault:
                    </Text>
                    <Grid
                      columnGap={{ base: '4', md: '8', lg: '12' }}
                      rowGap="5"
                      templateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))' }}
                    >
                      {deletedResources.map(({ label, icon: Icon }) => (
                        <Flex key={label} align="center" gap="4" minH="12">
                          <Flex
                            boxSize="12"
                            shrink="0"
                            align="center"
                            justify="center"
                            rounded="md"
                            borderWidth="1px"
                            borderColor="border.surface"
                            bg="bg.surface"
                            color="fg.muted"
                          >
                            <Icon size={19} />
                          </Flex>
                          <Text fontWeight="medium" color="fg">
                            {label}
                          </Text>
                        </Flex>
                      ))}
                    </Grid>
                  </Stack>

                  <Stack
                    gap="5"
                    rounded="md"
                    borderWidth="1px"
                    borderColor="red.muted"
                    bg="red.subtle/20"
                    px={{ base: '4', md: '5' }}
                    py={{ base: '5', md: '6' }}
                  >
                    <Flex gap="4" align="flex-start">
                      <Flex boxSize="12" shrink="0" align="center" justify="center" color="red.fg">
                        <AlertTriangle size={36} />
                      </Flex>
                      <Stack gap="1">
                        <Text fontSize="md" fontWeight="bold" color="red.fg">
                          This action is permanent and cannot be undone.
                        </Text>
                        <Text color="fg">
                          The vault and everything inside it will be permanently deleted.
                        </Text>
                        <Text fontWeight="bold" color="fg">
                          Nothing will be moved to Trash.
                        </Text>
                      </Stack>
                    </Flex>

                    <Box borderTopWidth="1px" borderColor="red.muted" />

                    <Stack gap="3">
                      <Text color="fg">
                        To confirm, type the vault name exactly as shown.
                      </Text>
                      <Box
                        as="code"
                        display="block"
                        rounded="md"
                        borderWidth="1px"
                        borderColor="red.muted"
                        bg="bg.surface"
                        px={{ base: '3', md: '4' }}
                        py="3"
                        fontSize={{ base: 'md', md: 'lg' }}
                        fontWeight="semibold"
                        color="fg"
                        whiteSpace="pre-wrap"
                        wordBreak="break-word"
                      >
                        {vault?.name ?? ''}
                      </Box>
                      <Field>
                        <FieldLabel htmlFor={inputId}>Type the vault name to confirm</FieldLabel>
                        <Input
                          id={inputId}
                          value={confirmation}
                          disabled={isPending}
                          autoComplete="off"
                          placeholder="Enter vault name (case-sensitive)"
                          spellCheck={false}
                          onChange={(event) => setConfirmation(event.target.value)}
                        />
                      </Field>
                      {errorMessage !== null ? <FieldError>{errorMessage}</FieldError> : null}
                    </Stack>
                  </Stack>
                </Stack>
              </ChakraDialog.Body>
              <ChakraDialog.Footer
                justifyContent="flex-end"
                gap="4"
                px={{ base: '5', md: '8' }}
                pb={{ base: '5', md: '7' }}
              >
                <Flex gap="3" justify="flex-end">
                  <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
                    Cancel
                  </Button>
                  <DeleteButton type="submit" disabled={!isValid || isPending}>
                    {isPending ? 'Deleting...' : 'Delete vault'}
                  </DeleteButton>
                </Flex>
              </ChakraDialog.Footer>
            </chakra.form>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

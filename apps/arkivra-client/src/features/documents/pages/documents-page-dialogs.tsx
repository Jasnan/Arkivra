import type { FormEvent } from 'react';
import {
  CloseButton,
  Dialog as ChakraDialog,
  Grid,
  Portal,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';
import { adminJoinAiAccessOptions, adminJoinRoleOptions } from './documents-page-browser-helpers';

export function AdminJoinVaultDialog({
  open,
  canDismiss,
  role,
  aiAccessLevel,
  isPending,
  onAiAccessLevelChange,
  onOpenChange,
  onRoleChange,
  onSubmit,
}: {
  open: boolean;
  canDismiss: boolean;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
  isPending: boolean;
  onAiAccessLevelChange: (value: AiAccessLevel) => void;
  onOpenChange: (open: boolean) => void;
  onRoleChange: (value: VaultRole) => void;
  onSubmit: (role: VaultRole, aiAccessLevel: AiAccessLevel) => void;
}) {
  return (
    <ChakraDialog.Root
      open={open}
      closeOnEscape={canDismiss}
      closeOnInteractOutside={canDismiss}
      onOpenChange={(event) => {
        if (!event.open && !isPending) {
          onOpenChange(false);
        }
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <chakra.form
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                onSubmit(role, aiAccessLevel);
              }}
            >
              <ChakraDialog.Header>
                <ChakraDialog.Title>Join vault</ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Stack gap="4">
                  <Text fontSize="sm" lineHeight="6" color="fg.muted">
                    You are about to become an explicit participant of this vault. This enables
                    collaborative actions and AI participation under your account.
                  </Text>
                  <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}>
                    <Field>
                      <FieldLabel>Vault role</FieldLabel>
                      <Select
                        value={role}
                        onValueChange={(value) => onRoleChange(value as VaultRole)}
                        disabled={isPending}
                      >
                        <SelectTrigger aria-label="Vault role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {adminJoinRoleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>AI access</FieldLabel>
                      <Select
                        value={aiAccessLevel}
                        onValueChange={(value) => onAiAccessLevelChange(value as AiAccessLevel)}
                        disabled={isPending}
                      >
                        <SelectTrigger aria-label="AI access">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {adminJoinAiAccessOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </Grid>
                </Stack>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Joining...' : 'Join'}
                </Button>
              </ChakraDialog.Footer>
            </chakra.form>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function CreateFolderDialog({
  open,
  canDismiss,
  folderName,
  isPending,
  onFolderNameChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  canDismiss: boolean;
  folderName: string;
  isPending: boolean;
  onFolderNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <ChakraDialog.Root
      open={open}
      closeOnEscape={canDismiss}
      closeOnInteractOutside={canDismiss}
      onOpenChange={(event) => onOpenChange(event.open)}
      size={{ mdDown: 'full', md: 'md' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <form onSubmit={onSubmit}>
              <ChakraDialog.Header>
                <ChakraDialog.Title>New folder</ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Stack gap="2">
                  <chakra.label htmlFor="folder-name" fontSize="sm" fontWeight="medium" color="fg">
                    Name
                  </chakra.label>
                  <Input
                    id="folder-name"
                    value={folderName}
                    onChange={(event) => onFolderNameChange(event.target.value)}
                    autoFocus
                  />
                </Stack>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                <Button type="submit" disabled={folderName.trim().length === 0 || isPending}>
                  {isPending ? 'Creating...' : 'Create'}
                </Button>
              </ChakraDialog.Footer>
            </form>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

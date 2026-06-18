import type { FormEvent } from 'react';
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
import { Mail, Send, Sparkles, UserRoundPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';
import {
  InviteSelect,
  MemberAccessFields,
  aiAccessDescriptions,
  aiAccessOptions,
  roleDescriptions,
  roleOptions,
} from './vault-members-panel.helpers';
import type { InviteMode, PendingMemberAction } from './vault-members-panel.helpers';

export function MemberRemovalDialog({
  pendingAction,
  memberName,
  isPending,
  onCancel,
  onConfirm,
}: {
  pendingAction: PendingMemberAction;
  memberName: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ChakraDialog.Root
      open={pendingAction !== null}
      closeOnEscape={!isPending}
      closeOnInteractOutside={!isPending}
      onOpenChange={(event) => {
        if (!event.open && !isPending) {
          onCancel();
        }
      }}
      size={{ mdDown: 'full', md: 'md' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>
                {pendingAction?.type === 'remove-owner-role'
                  ? 'Remove owner role?'
                  : 'Remove member from vault?'}
              </ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Text fontSize="sm" lineHeight="6" color="fg.muted">
                {pendingAction?.type === 'remove-owner-role'
                  ? `${memberName} will become a viewer and will no longer manage vault settings or members.`
                  : `${memberName} will lose access to this vault.`}
              </Text>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" colorPalette="red" disabled={isPending} onClick={onConfirm}>
                {isPending
                  ? 'Removing...'
                  : pendingAction?.type === 'remove-owner-role'
                    ? 'Remove owner role'
                    : 'Remove from vault'}
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function VaultInviteDialog({
  open,
  canDismiss,
  canManageMembers,
  inviteAiAccessLevel,
  inviteMode,
  inviteMutationPending,
  inviteRole,
  inviteTarget,
  onAiAccessLevelChange,
  onModeChange,
  onOpenChange,
  onRoleChange,
  onSubmit,
  onTargetChange,
}: {
  open: boolean;
  canDismiss: boolean;
  canManageMembers: boolean;
  inviteAiAccessLevel: AiAccessLevel;
  inviteMode: InviteMode;
  inviteMutationPending: boolean;
  inviteRole: VaultRole;
  inviteTarget: string;
  onAiAccessLevelChange: (value: AiAccessLevel) => void;
  onModeChange: (value: InviteMode) => void;
  onOpenChange: (open: boolean) => void;
  onRoleChange: (value: VaultRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTargetChange: (value: string) => void;
}) {
  return (
    <ChakraDialog.Root
      open={open}
      closeOnEscape={canDismiss}
      closeOnInteractOutside={canDismiss}
      onOpenChange={(event) => {
        if (!event.open && canDismiss) {
          onOpenChange(false);
        }
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <chakra.form onSubmit={onSubmit}>
              <ChakraDialog.Header px="7" pt="7" pb="3">
                <Stack gap="3" flex="1">
                  <Flex align="center" justify="space-between" gap="4">
                    <ChakraDialog.Title>Invite Member</ChakraDialog.Title>
                    <ChakraDialog.CloseTrigger asChild>
                      <CloseButton size="sm" />
                    </ChakraDialog.CloseTrigger>
                  </Flex>
                  <Text fontSize="sm" color="fg.muted">
                    Invite a new member to this vault.
                  </Text>
                </Stack>
              </ChakraDialog.Header>
              <ChakraDialog.Body px="7" py="4">
                <Stack gap="5">
                  <Field>
                    <FieldLabel>Invite by</FieldLabel>
                    <Grid
                      templateColumns="repeat(2, minmax(0, 1fr))"
                      overflow="hidden"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.surface"
                    >
                      <chakra.button
                        type="button"
                        minH="3.25rem"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        gap="2"
                        borderBottomWidth="2px"
                        borderColor={inviteMode === 'direct' ? 'teal.solid' : 'transparent'}
                        bg={inviteMode === 'direct' ? 'teal.subtle' : 'bg.surface'}
                        color={inviteMode === 'direct' ? 'teal.fg' : 'fg.muted'}
                        fontSize="sm"
                        fontWeight="semibold"
                        onClick={() => onModeChange('direct')}
                      >
                        <Mail size={16} />
                        Email or User ID
                      </chakra.button>
                      <chakra.button
                        type="button"
                        minH="3.25rem"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        gap="2"
                        borderBottomWidth="2px"
                        borderLeftWidth="1px"
                        borderColor={inviteMode === 'email' ? 'teal.solid' : 'border.surface'}
                        bg={inviteMode === 'email' ? 'teal.subtle' : 'bg.surface'}
                        color={inviteMode === 'email' ? 'teal.fg' : 'fg.muted'}
                        fontSize="sm"
                        fontWeight="semibold"
                        onClick={() => onModeChange('email')}
                      >
                        <Mail size={16} />
                        Email Invitation
                      </chakra.button>
                    </Grid>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="vault-invite-target">
                      {inviteMode === 'email' ? 'Email' : 'Email or User ID'}
                    </FieldLabel>
                    <Box position="relative">
                      <Input
                        id="vault-invite-target"
                        type={inviteMode === 'email' ? 'email' : 'text'}
                        value={inviteTarget}
                        onChange={(event) => onTargetChange(event.target.value)}
                        placeholder={
                          inviteMode === 'email'
                            ? 'Enter email address'
                            : 'Enter email address or user ID'
                        }
                        disabled={!canManageMembers || inviteMutationPending}
                        pr="11"
                      />
                      <Flex
                        position="absolute"
                        top="0"
                        right="3"
                        h="full"
                        align="center"
                        justify="center"
                        color="fg.muted"
                        pointerEvents="none"
                      >
                        <UserRoundPlus size={17} />
                      </Flex>
                    </Box>
                    <FieldDescription>
                      {inviteMode === 'email'
                        ? 'Admins create invitations immediately. Owner invitations are queued for admin approval.'
                        : 'If the user has an Arkivra account, they will be added immediately. Otherwise, an email invitation will be sent.'}
                    </FieldDescription>
                  </Field>

                  <InviteSelect
                    id="vault-invite-role"
                    label="Role"
                    value={inviteRole}
                    disabled={!canManageMembers || inviteMutationPending}
                    icon={<Users size={17} />}
                    description={roleDescriptions[inviteRole]}
                    options={roleOptions}
                    onValueChange={(value) => onRoleChange(value as VaultRole)}
                  />

                  <InviteSelect
                    id="vault-invite-ai-access"
                    label="AI access"
                    value={inviteAiAccessLevel}
                    disabled={!canManageMembers || inviteMutationPending}
                    icon={<Sparkles size={17} />}
                    description={aiAccessDescriptions[inviteAiAccessLevel]}
                    options={aiAccessOptions}
                    onValueChange={(value) => onAiAccessLevelChange(value as AiAccessLevel)}
                  />
                </Stack>
              </ChakraDialog.Body>
              <ChakraDialog.Footer px="7" pb="7" pt="3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={inviteMutationPending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!canManageMembers || inviteMutationPending}>
                  <Send size={16} />
                  {inviteMutationPending ? 'Sending...' : 'Send Invite'}
                </Button>
              </ChakraDialog.Footer>
            </chakra.form>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function AdminJoinVaultDialog({
  open,
  canDismiss,
  aiAccessLevel,
  isPending,
  role,
  onAiAccessLevelChange,
  onOpenChange,
  onRoleChange,
  onSubmit,
}: {
  open: boolean;
  canDismiss: boolean;
  aiAccessLevel: AiAccessLevel;
  isPending: boolean;
  role: VaultRole;
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
        if (!event.open && canDismiss) {
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
                  <MemberAccessFields
                    idPrefix="admin-join-vault"
                    role={role}
                    aiAccessLevel={aiAccessLevel}
                    disabled={isPending}
                    onRoleChange={onRoleChange}
                    onAiAccessLevelChange={onAiAccessLevelChange}
                  />
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

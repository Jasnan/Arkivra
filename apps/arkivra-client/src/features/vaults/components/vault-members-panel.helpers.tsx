/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { Box, Grid, HStack } from '@chakra-ui/react';
import { Crown } from 'lucide-react';
import { vaultInputClassName } from '@/components/layout/vault-ui';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AiAccessLevel,
  VaultMember,
  VaultPendingInvitation,
  VaultRole,
} from '@/features/vaults/vaults.types';

export const roleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

export const aiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'Disabled' },
  { value: 'full', label: 'Enabled' },
];

export const roleDescriptions: Record<VaultRole, string> = {
  viewer: 'View and download content. Cannot edit or manage members.',
  editor: 'Upload, edit, and organize vault content.',
  owner: 'Manage vault settings, members, and owner access.',
};

export const aiAccessDescriptions: Record<AiAccessLevel, string> = {
  none: 'AI features are disabled for this member in this vault.',
  full: 'AI features are enabled for this member in this vault.',
};

export type InviteMode = 'direct' | 'email';
export type PendingMemberAction = {
  type: 'remove-member' | 'remove-owner-role';
  member: VaultMember;
} | null;

export function isRequestResponse<T extends object>(
  value: T | { request: unknown },
): value is { request: unknown } {
  return 'request' in value;
}

export function getMemberDisplayName(member: VaultMember) {
  return member.name ?? member.email ?? member.userId;
}

export function getMemberInitial(member: VaultMember) {
  return getMemberDisplayName(member).trim().charAt(0).toUpperCase() || '?';
}

export function getMemberAvatarTone(index: number) {
  const tones = [
    { bg: 'green.subtle', color: 'green.fg' },
    { bg: 'purple.subtle', color: 'purple.fg' },
    { bg: 'blue.subtle', color: 'blue.fg' },
    { bg: 'orange.subtle', color: 'orange.fg' },
    { bg: 'teal.subtle', color: 'teal.fg' },
  ];

  return tones[index % tones.length]!;
}

function getRoleSelectTone(role: VaultRole) {
  if (role === 'owner') {
    return { bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' };
  }
  if (role === 'editor') {
    return { bg: 'blue.subtle', color: 'blue.fg', borderColor: 'blue.muted' };
  }

  return { bg: 'bg.subtle', color: 'fg.muted', borderColor: 'border.surface' };
}

function getAiAccessSelectTone(aiAccessLevel: AiAccessLevel) {
  if (aiAccessLevel === 'full') {
    return { bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' };
  }

  return { bg: 'orange.subtle', color: 'orange.fg', borderColor: 'orange.muted' };
}

export function getPendingRequestLabel(invitation: VaultPendingInvitation) {
  if (invitation.requestType === 'vault.owner_promote') return 'Owner promotion pending approval';
  if (invitation.requestType === 'vault.ai_access_grant') return 'AI access pending approval';
  if (invitation.requestType === 'vault.external_invite')
    return 'External invitation pending approval';
  return 'Invitation pending approval';
}

export function getPendingInvitationStatus(invitation: VaultPendingInvitation) {
  if (invitation.status === 'approval_pending') {
    return { label: 'Awaiting admin approval', colorPalette: 'orange' };
  }

  return { label: 'Pending acceptance', colorPalette: 'blue' };
}

export function formatPendingInviteDate(value: string | null) {
  if (value === null) {
    return 'No expiry';
  }

  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MemberAccessFields({
  role,
  aiAccessLevel,
  disabled,
  idPrefix,
  onRoleChange,
  onAiAccessLevelChange,
}: {
  idPrefix: string;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
  disabled?: boolean;
  onRoleChange: (role: VaultRole) => void;
  onAiAccessLevelChange: (level: AiAccessLevel) => void;
}) {
  return (
    <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-role`}>Vault role</FieldLabel>
        <Select
          value={role}
          onValueChange={(value) => onRoleChange(value as VaultRole)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-role`} className={vaultInputClassName}>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-ai-access`}>AI access</FieldLabel>
        <Select
          value={aiAccessLevel}
          onValueChange={(value) => onAiAccessLevelChange(value as AiAccessLevel)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-ai-access`} className={vaultInputClassName}>
            <SelectValue placeholder="Select AI access" />
          </SelectTrigger>
          <SelectContent>
            {aiAccessOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </Grid>
  );
}

export function RoleSelect({
  value,
  disabled,
  disabledRoles = [],
  onValueChange,
}: {
  value: VaultRole;
  disabled?: boolean;
  disabledRoles?: VaultRole[];
  onValueChange: (role: VaultRole) => void;
}) {
  const tone = getRoleSelectTone(value);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as VaultRole)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="Vault role"
        minW="10rem"
        h="2.5rem"
        rounded="md"
        bg={tone.bg}
        color={tone.color}
        borderColor={tone.borderColor}
        px="3"
        _hover={{ bg: tone.bg, borderColor: tone.borderColor }}
      >
        <HStack gap="2">
          {value === 'owner' ? <Crown size={15} /> : null}
          <SelectValue />
        </HStack>
      </SelectTrigger>
      <SelectContent>
        {!disabledRoles.includes('viewer') ? <SelectItem value="viewer">Viewer</SelectItem> : null}
        {!disabledRoles.includes('editor') ? <SelectItem value="editor">Editor</SelectItem> : null}
        {!disabledRoles.includes('viewer') || !disabledRoles.includes('editor') ? (
          <Box mx="-1" my="1" h="1px" bg="border.divider" />
        ) : null}
        <SelectItem value="owner">Owner</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AiAccessSelect({
  value,
  disabled,
  onValueChange,
}: {
  value: AiAccessLevel;
  disabled?: boolean;
  onValueChange: (level: AiAccessLevel) => void;
}) {
  const tone = getAiAccessSelectTone(value);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as AiAccessLevel)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="AI access"
        minW="12rem"
        h="2.5rem"
        rounded="md"
        bg={tone.bg}
        color={tone.color}
        borderColor={tone.borderColor}
        px="3"
        _hover={{ bg: tone.bg, borderColor: tone.borderColor }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {aiAccessOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InviteSelect({
  id,
  label,
  value,
  disabled,
  icon,
  description,
  options,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  icon: ReactNode;
  description: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} h="3rem" rounded="md" px="4">
          <HStack gap="3">
            {icon}
            <SelectValue />
          </HStack>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import type { VaultRole } from './vaults.types.js';

export function getValidName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();
  return name.length > 0 ? name : null;
}

export function getValidEmail(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  const atIndex = email.indexOf('@');
  const lastDotIndex = email.lastIndexOf('.');
  const hasWhitespace = email.split('').some((character) => character.trim().length === 0);

  return !hasWhitespace &&
    atIndex > 0 &&
    atIndex === email.lastIndexOf('@') &&
    lastDotIndex > atIndex + 1 &&
    lastDotIndex < email.length - 1
    ? email
    : null;
}

export function getValidDescription(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const description = value.trim();
  return description.length > 0 ? description : null;
}

export function getValidRole(value: unknown): VaultRole | null {
  return value === 'owner' || value === 'editor' || value === 'viewer' ? value : null;
}

export function getMemberUpdateAuditEventType({
  previousRole,
  nextRole,
}: {
  previousRole: VaultRole;
  nextRole: VaultRole;
}) {
  if (previousRole === 'owner' && nextRole !== 'owner') {
    return AUDIT_EVENT_TYPES.vaultOwnerRoleRemoved;
  }

  return AUDIT_EVENT_TYPES.vaultMemberRoleChanged;
}

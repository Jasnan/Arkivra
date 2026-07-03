import type { AuditJson } from './audit.types.js';

const DANGEROUS_KEY_PATTERN = /password|token|access_token|refresh_token|authorization|cookie|secret|api_key|private_key|file_content|content|raw_text|ocr_text/i;
const REDACTED = '[redacted]';

const SAFE_METADATA_BY_EVENT: Record<string, Set<string>> = {
  'document.uploaded': new Set(['file_name', 'file_size', 'mime_type']),
  'document.deleted': new Set(['document_name', 'file_name', 'deletion_type']),
  'document.viewed': new Set(['file_name', 'access_method']),
  'document.downloaded': new Set(['file_name', 'access_method']),
  'document.access_denied': new Set(['action']),
  'document.delete_failed': new Set(['document_name', 'file_name', 'deletion_type', 'reason']),
  'vault.member_added': new Set(['member_user_id', 'role']),
  'vault.member_removed': new Set(['member_user_id', 'role']),
  'vault.member_role_changed': new Set(['member_user_id', 'previous_role', 'next_role']),
  'vault.access_denied': new Set(['action']),
  'auth.two_factor_enabled': new Set(['method']),
  'auth.two_factor_disabled': new Set(['method']),
  'auth.password_changed': new Set(['revoke_other_sessions']),
  'auth.password_set': new Set(['method']),
  'auth.email_change_requested': new Set(['verification_method']),
  'auth.email_changed': new Set(['verification_method']),
  'auth.oauth_link_requested': new Set(['provider', 'verification_method']),
  'auth.oauth_linked': new Set(['provider', 'verification_method']),
  'auth.sensitive_action_denied': new Set(['action', 'provider', 'reason']),
};

function isPlainObject(value: unknown): value is AuditJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return sanitizeObject(value);
}

function sanitizeObject(value: AuditJson) {
  const sanitized: AuditJson = {};

  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = DANGEROUS_KEY_PATTERN.test(key) ? REDACTED : redactValue(item);
  }

  return sanitized;
}

export function sanitizeAuditJson(value: AuditJson | null | undefined): AuditJson | null {
  if (value === null || value === undefined) {
    return null;
  }

  return sanitizeObject(value);
}

export function sanitizeAuditMetadata(eventType: string, metadata: AuditJson | null | undefined): AuditJson | null {
  if (metadata === null || metadata === undefined) {
    return null;
  }

  const allowlist = SAFE_METADATA_BY_EVENT[eventType];

  if (allowlist === undefined) {
    return sanitizeObject(metadata);
  }

  const filtered: AuditJson = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (allowlist.has(key)) {
      filtered[key] = value;
    }
  }

  return sanitizeObject(filtered);
}

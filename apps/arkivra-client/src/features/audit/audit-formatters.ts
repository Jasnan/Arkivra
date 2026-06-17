import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { AuditLogItem } from './audit.types';

interface AuditMetadataFormatOptions {
  includeAdvanced?: boolean;
  advancedOnly?: boolean;
}

const TECHNICAL_METADATA_KEYS = new Set([
  'original_sha256_hash',
]);

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isAdvancedMetadataKey(key: string) {
  return (
    key === 'id'
    || key.endsWith('_id')
    || key.endsWith('_ids')
    || key.endsWith('_hash')
    || TECHNICAL_METADATA_KEYS.has(key)
  );
}

function addEntry(
  entries: Array<{ key: string; label: string; value: string }>,
  key: string,
  label: string,
  value: unknown,
) {
  if (value === null || value === undefined) {
    return;
  }

  const formattedValue = formatAuditMetadataValue(key, value);

  if (formattedValue.length > 0) {
    entries.push({ key, label, value: formattedValue });
  }
}

export function formatAuditTimestamp(value: string) {
  return formatDate(value);
}

export function formatAuditEventTitle(event: Pick<AuditLogItem, 'eventType' | 'summary'>) {
  switch (event.eventType) {
    case 'document.uploaded':
      return 'File uploaded';
    case 'document.viewed':
      return 'File viewed';
    case 'document.downloaded':
      return 'File downloaded';
    case 'document.deleted':
      return 'File deleted';
    case 'document.delete_failed':
      return 'File deletion failed';
    case 'document.version_created':
      return 'New version uploaded';
    case 'document.version_restored':
      return 'Document version restored';
    case 'document.version_deleted':
      return 'Document version deleted';
    case 'document.version_delete_failed':
      return 'Document version deletion failed';
    case 'document.access_denied':
      return 'Document access denied';
    case 'ai.features_toggled':
      return 'Toggled AI features';
    case 'ai.chat_model_changed':
      return 'Changed the chat model';
    case 'ai.translation_model_changed':
      return 'Changed the translation model';
    case 'ai.embedding_model_changed':
      return 'Changed the embedding model';
    case 'vault.member_added':
      return 'Added a vault member';
    case 'vault.member_removed':
      return 'Removed a vault member';
    case 'vault.member_role_changed':
      return 'Changed a member role';
    case 'vault.access_denied':
      return 'Vault access denied';
    case 'auth.two_factor_enabled':
      return 'Enabled two-factor authentication';
    case 'auth.two_factor_disabled':
      return 'Disabled two-factor authentication';
    case 'auth.password_changed':
      return 'Changed password';
    case 'auth.password_set':
      return 'Set password';
    case 'auth.email_change_requested':
      return 'Requested an email change';
    case 'auth.email_changed':
      return 'Changed email';
    case 'auth.oauth_link_requested':
      return 'Requested sign-in provider linking';
    case 'auth.oauth_linked':
      return 'Connected a sign-in provider';
    case 'auth.sensitive_action_denied':
      return 'Sensitive account action denied';
    default:
      return event.eventType;
  }
}

export function formatAuditMetadataValue(key: string, value: unknown) {
  if (key === 'file_size' && typeof value === 'number') {
    return formatBytes(value);
  }

  if (value === null || value === undefined) {
    return 'Not set';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

export function formatAuditMetadataEntries(
  metadata: Record<string, unknown>,
  options: AuditMetadataFormatOptions = {},
) {
  const hasFileName = Object.hasOwn(metadata, 'file_name');

  return Object.entries(metadata).flatMap(([key, value]) => {
    if (key === 'document_name' && hasFileName) {
      return [];
    }

    const isAdvanced = isAdvancedMetadataKey(key);
    if (!options.includeAdvanced && isAdvanced) {
      return [];
    }

    if (options.advancedOnly && !isAdvanced) {
      return [];
    }

    const formattedValue = formatAuditMetadataValue(key, value);
    return formattedValue.length > 0
      ? [{ key, label: formatAuditMetadataLabel(key), value: formattedValue }]
      : [];
  });
}

export function getAuditResourceLabel(event: AuditLogItem) {
  if (event.resource?.documentPath) {
    return event.resource.documentPath;
  }

  const metadataPath = getMetadataString(event.metadata, 'to_path')
    ?? getMetadataString(event.metadata, 'from_path');
  const fileName = getMetadataString(event.metadata, 'file_name')
    ?? getMetadataString(event.metadata, 'document_name')
    ?? event.resource?.documentName
    ?? null;
  const vaultName = event.resource?.vaultName
    ?? (event.targetType === 'vault' ? event.targetDisplayName : null)
    ?? getMetadataString(event.metadata, 'vault_name');

  if (vaultName && metadataPath && fileName) {
    return `${vaultName} / ${metadataPath} / ${fileName}`;
  }

  if (vaultName && fileName) {
    return `${vaultName} / ${fileName}`;
  }

  if (fileName) {
    return fileName;
  }

  if (vaultName) {
    return vaultName;
  }

  return event.resource?.targetName ?? event.targetDisplayName ?? null;
}

export function formatAuditAdvancedEntries(event: AuditLogItem) {
  const entries: Array<{ key: string; label: string; value: string }> = [];

  addEntry(entries, 'resource_path', 'Resource Path', getAuditResourceLabel(event));
  addEntry(entries, 'vault_name', 'Vault Name', event.resource?.vaultName);
  addEntry(entries, 'vault_id', 'Vault ID', event.vaultId);
  addEntry(entries, 'document_name', 'File Name', event.resource?.documentName ?? getMetadataString(event.metadata, 'document_name') ?? getMetadataString(event.metadata, 'file_name'));
  addEntry(entries, 'document_id', 'Document ID', event.documentId);
  addEntry(entries, 'target_name', 'Target Name', event.resource?.targetName ?? event.targetDisplayName);
  addEntry(entries, 'target_type', 'Target Type', event.targetType);
  addEntry(entries, 'target_id', 'Target ID', event.targetId);
  addEntry(entries, 'actor_type', 'Actor Type', event.actorType);
  addEntry(entries, 'actor_id', 'Actor ID', event.actorId);
  addEntry(entries, 'source', 'Source', event.source);
  addEntry(entries, 'request_id', 'Request ID', event.requestId);
  addEntry(entries, 'ip_address', 'IP Address', event.ipAddress);
  addEntry(entries, 'user_agent', 'User Agent', event.userAgent);

  for (const entry of formatAuditMetadataEntries(event.metadata, {
    includeAdvanced: true,
    advancedOnly: true,
  })) {
    if (!entries.some(existing => existing.key === `metadata.${entry.key}` || existing.value === entry.value)) {
      entries.push({ ...entry, key: `metadata.${entry.key}` });
    }
  }

  return entries;
}

export function formatAuditMetadataLabel(key: string) {
  if (key === 'file_name' || key === 'document_name') {
    return 'File Name';
  }

  return key
    .split('_')
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === 'id') {
        return 'ID';
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

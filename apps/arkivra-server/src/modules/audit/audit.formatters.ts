import type { AuditEventRecord } from './audit.types.js';

export function getAuditActorLabel(event: Pick<AuditEventRecord, 'actorDisplayName' | 'actorType'>) {
  if (event.actorDisplayName?.trim()) {
    return event.actorDisplayName.trim();
  }

  return event.actorType === 'system' ? 'System' : 'Unknown user';
}

export function formatAuditEventSummary(event: AuditEventRecord) {
  const actor = getAuditActorLabel(event);

  switch (event.eventType) {
    case 'document.uploaded':
      return `${actor} uploaded file`;
    case 'document.viewed':
      return `${actor} viewed file`;
    case 'document.downloaded':
      return `${actor} downloaded file`;
    case 'document.deleted':
      return `${actor} deleted file`;
    case 'document.delete_failed':
      return `${actor} could not delete file`;
    case 'folder.deleted':
      return `${actor} deleted folder`;
    case 'folder.delete_failed':
      return `${actor} could not delete folder`;
    case 'document.access_denied':
      return `Access was denied for ${actor}`;
    case 'ai.features_toggled':
      return `${actor} toggled AI features`;
    case 'ai.chat_model_changed':
      return `${actor} changed the chat model`;
    case 'ai.translation_model_changed':
      return `${actor} changed the translation model`;
    case 'ai.embedding_model_changed':
      return `${actor} changed the embedding model`;
    case 'vault.member_added':
      return `${actor} added a vault member`;
    case 'vault.member_removed':
      return `${actor} removed a vault member`;
    case 'vault.member_role_changed':
      return `${actor} changed a member role`;
    case 'vault.created':
      return `${actor} created vault`;
    case 'vault.create_requested':
      return `${actor} requested vault creation`;
    case 'vault.create_failed':
      return `${actor} could not create vault`;
    case 'vault.deleted':
      return `${actor} deleted vault`;
    case 'vault.delete_failed':
      return `${actor} could not delete vault`;
    case 'vault.access_denied':
      return `Vault access was denied for ${actor}`;
    case 'auth.two_factor_enabled':
      return `${actor} enabled two-factor authentication`;
    case 'auth.two_factor_disabled':
      return `${actor} disabled two-factor authentication`;
    case 'auth.password_changed':
      return `${actor} changed their password`;
    case 'auth.password_set':
      return `${actor} set a password`;
    case 'auth.email_change_requested':
      return `${actor} requested an email change`;
    case 'auth.email_changed':
      return `${actor} changed their email`;
    case 'auth.oauth_link_requested':
      return `${actor} requested sign-in provider linking`;
    case 'auth.oauth_linked':
      return `${actor} connected a sign-in provider`;
    case 'auth.sensitive_action_denied':
      return `A sensitive account action was denied for ${actor}`;
    default:
      return `${actor} performed ${event.eventType}`;
  }
}

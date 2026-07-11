import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { documentsTable } from '../database/schema/index.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { VaultAccess } from '../vaults/vaults.types.js';
import type { ChatScopeInput } from './chat.services.js';
import {
  MAX_CHAT_MESSAGES_PER_REQUEST,
  MAX_CHAT_MESSAGE_TEXT_LENGTH,
} from './chat.constants.js';
import type {
  ChatContextAvailability,
  ChatContextDocumentRef,
  ChatContextSnapshot,
  ChatContextVaultRef,
  ChatIntent,
  ChatMessage,
} from './chat.types.js';

export type ChatRouteErrorCode =
  | 'auth.unauthorized'
  | 'authorization.use_ai_required'
  | 'chat.invalid_content'
  | 'chat.invalid_context'
  | 'chat.invalid_include_citations'
  | 'chat.invalid_intent'
  | 'chat.invalid_model'
  | 'chat.invalid_response_mode'
  | 'chat.context_locked'
  | 'chat.context_unavailable'
  | 'chat.model_options_unavailable'
  | 'chat.not_found'
  | 'vault.forbidden';

export type ChatContextResolution =
  | { ok: true; scope: ChatScopeInput }
  | { ok: false; status: 400 | 401 | 403 | 404; code: ChatRouteErrorCode; message: string };

export const SOURCE_DOCUMENT_DELETED_CONTEXT: ChatContextAvailability = {
  status: 'source_document_deleted',
  readOnly: true,
  message:
    'One or more source documents were deleted. This conversation is available as read-only history.',
};

export function routeError(
  context: Context<ServerContext>,
  {
    code,
    message,
    status,
  }: { code: ChatRouteErrorCode; message: string; status: 400 | 401 | 403 | 404 | 409 | 502 },
) {
  return context.json({ error: { code, message } }, status);
}

export function isDeletedSourceResolution(resolved: ChatContextResolution) {
  return (
    !resolved.ok &&
    resolved.status === 404 &&
    resolved.code === 'chat.not_found' &&
    resolved.message === 'Document not found'
  );
}

export function parseResponseMode(value: unknown) {
  if (value === undefined) {
    return 'multimodal' as const;
  }

  return value === 'text' || value === 'multimodal' ? value : null;
}

export function parseIncludeCitations(value: unknown) {
  if (value === undefined || value === null) {
    return true;
  }

  return typeof value === 'boolean' ? value : null;
}

export function parseModel(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseIntent(value: unknown): ChatIntent | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value === 'search' || value === 'summarize' || value === 'compare' || value === 'extract'
    ? value
    : null;
}

export function getUiMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export function parseMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is ChatMessage =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      (item.role === 'system' || item.role === 'user' || item.role === 'assistant') &&
      Array.isArray(item.parts),
  );
}

export function validateSubmittedChatMessages(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false as const, message: 'messages must include a non-empty user text message' };
  }

  if (value.length > MAX_CHAT_MESSAGES_PER_REQUEST) {
    return {
      ok: false as const,
      message: `messages must contain at most ${MAX_CHAT_MESSAGES_PER_REQUEST} items`,
    };
  }

  for (const item of value) {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant')) {
      return { ok: false as const, message: 'messages may only contain user and assistant roles' };
    }
    if (!Array.isArray(item.parts)) {
      return { ok: false as const, message: 'each message must contain a parts array' };
    }

    const textLength = item.parts.reduce((total, part) => {
      if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') return total;
      return total + part.text.length;
    }, 0);
    if (textLength > MAX_CHAT_MESSAGE_TEXT_LENGTH) {
      return {
        ok: false as const,
        message: `message text must be at most ${MAX_CHAT_MESSAGE_TEXT_LENGTH} characters`,
      };
    }
  }

  return { ok: true as const };
}

export function getLatestUserMessageContent(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) continue;
    if (message.role === 'user') {
      return getUiMessageText(message);
    }
  }

  return '';
}

export function getUserId(context: Context<ServerContext>) {
  return context.get('userId');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    : [];
}

export function parseOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function dedupeVaultRefs(vaults: ChatContextVaultRef[]) {
  const seen = new Set<string>();
  const deduped: ChatContextVaultRef[] = [];

  for (const vault of vaults) {
    const vaultId = vault.vaultId.trim();
    if (vaultId.length === 0 || seen.has(vaultId)) {
      continue;
    }

    seen.add(vaultId);
    deduped.push({
      vaultId,
      ...(vault.name ? { name: vault.name } : {}),
    });
  }

  return deduped;
}

export function dedupeDocumentRefs(
  documents: ChatContextDocumentRef[],
  selectedVaultIds = new Set<string>(),
) {
  const seen = new Set<string>();
  const deduped: ChatContextDocumentRef[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (
      vaultId.length === 0 ||
      documentId.length === 0 ||
      selectedVaultIds.has(vaultId) ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    deduped.push({
      vaultId,
      documentId,
      ...(document.name ? { name: document.name } : {}),
      ...(document.vaultName ? { vaultName: document.vaultName } : {}),
      ...(document.path ? { path: document.path } : {}),
    });
  }

  return deduped;
}

export function parseVaultRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeVaultRefs(
    value.map((item) => {
      if (typeof item === 'string') {
        return { vaultId: item.trim() };
      }

      if (!isRecord(item)) {
        return { vaultId: '' };
      }

      return {
        vaultId: typeof item.vaultId === 'string' ? item.vaultId.trim() : '',
        name: parseOptionalString(item.name),
      };
    }),
  );
}

export function parseDocumentRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeDocumentRefs(
    value.map((item) => {
      if (!isRecord(item)) {
        return { vaultId: '', documentId: '' };
      }

      return {
        vaultId: typeof item.vaultId === 'string' ? item.vaultId.trim() : '',
        documentId: typeof item.documentId === 'string' ? item.documentId.trim() : '',
        name: parseOptionalString(item.name),
        vaultName: parseOptionalString(item.vaultName),
        path: parseOptionalString(item.path),
      };
    }),
  );
}

export function canReadVault(vault: VaultAccess) {
  return (
    vault.role === 'owner' ||
    vault.role === 'editor' ||
    vault.role === 'viewer' ||
    vault.isAdmin
  );
}

export function getRawRequestedContext(body: Record<string, unknown>) {
  return isRecord(body.contextSnapshot)
    ? body.contextSnapshot
    : isRecord(body.context)
      ? body.context
      : body;
}

export function hasOwnField(value: Record<string, unknown>, field: string) {
  return Object.hasOwn(value, field);
}

export function hasUnsupportedDocumentVersionContext(body: Record<string, unknown>) {
  const rawContext = getRawRequestedContext(body);

  if (hasOwnField(rawContext, 'documentVersionId') || hasOwnField(rawContext, 'versionNumber')) {
    return true;
  }

  if (!Array.isArray(rawContext.documents)) {
    return false;
  }

  return rawContext.documents.some(
    (item) =>
      isRecord(item) &&
      (hasOwnField(item, 'documentVersionId') || hasOwnField(item, 'versionNumber')),
  );
}

export function parseRequestedContext(body: Record<string, unknown>): ChatContextSnapshot {
  const rawContext = getRawRequestedContext(body);
  const rawVaultRefs = parseVaultRefs(rawContext.vaults);
  const rawVaultIdRefs = parseStringArray(rawContext.vaultIds).map((vaultId) => ({ vaultId }));
  const vaults = dedupeVaultRefs([...rawVaultRefs, ...rawVaultIdRefs]);
  const selectedVaultIds = new Set(vaults.map((vault) => vault.vaultId));
  const rawDocumentRefs = parseDocumentRefs(rawContext.documents);

  if (rawContext.type === 'selection' || rawVaultRefs.length > 0 || rawDocumentRefs.length > 0) {
    return {
      type: 'selection',
      vaults,
      documents: dedupeDocumentRefs(rawDocumentRefs, selectedVaultIds),
    };
  }

  const rawVaultId = rawContext.vaultId;
  const rawDocumentId = rawContext.documentId;

  if (rawContext.type === 'document' || typeof rawDocumentId === 'string') {
    return {
      type: 'document',
      vaultId: typeof rawVaultId === 'string' ? rawVaultId.trim() : '',
      documentId: typeof rawDocumentId === 'string' ? rawDocumentId.trim() : '',
      vaultName: parseOptionalString(rawContext.vaultName),
      documentName: parseOptionalString(rawContext.documentName),
    };
  }

  if (rawContext.type === 'vault' || typeof rawVaultId === 'string') {
    return {
      type: 'vault',
      vaultId: typeof rawVaultId === 'string' ? rawVaultId.trim() : '',
      vaultName: parseOptionalString(rawContext.vaultName),
    };
  }

  return { type: 'global', vaultIds: [] };
}

export async function getDocumentContext({
  db,
  vaultId,
  documentId,
}: {
  db: Database;
  vaultId: string;
  documentId: string;
}) {
  const [document] = await db
    .select({ id: documentsTable.id, name: documentsTable.name })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.vaultId, vaultId),
        eq(documentsTable.isDeleted, false),
      ),
    )
    .limit(1);

  return document ?? null;
}

export async function resolveCreatableContext({
  context,
  requestedContext,
  db,
  vaultServices,
}: {
  context: Context<ServerContext>;
  requestedContext: ChatContextSnapshot;
  db: Database;
  vaultServices: VaultsServices;
}): Promise<ChatContextResolution> {
  const userId = getUserId(context);

  if (userId === null) {
    return { ok: false, status: 401, code: 'auth.unauthorized', message: 'Unauthorized' };
  }

  if (!context.get('canUseAI')) {
    return {
      ok: false,
      status: 403,
      code: 'authorization.use_ai_required',
      message: 'Use AI privilege required',
    };
  }

  if (requestedContext.type === 'global') {
    const vaults = await vaultServices.listUserVaults({ userId });
    const vaultIds = vaults
      .filter(canReadVault)
      .map((vault) => vault.id);

    if (vaultIds.length === 0) {
      return {
        ok: false,
        status: 403,
        code: 'vault.forbidden',
        message: 'No readable vaults available',
      };
    }

    return { ok: true, scope: { type: 'global', vaultIds } };
  }

  if (requestedContext.type === 'selection') {
    const vaults: ChatContextVaultRef[] = [];
    const documents: ChatContextDocumentRef[] = [];

    for (const requestedVault of dedupeVaultRefs(requestedContext.vaults)) {
      const vault = await vaultServices.getVaultForUser({
        vaultId: requestedVault.vaultId,
        userId,
      });

      if (vault === null) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }

      if (!canReadVault(vault)) {
        return {
          ok: false,
          status: 403,
          code: 'vault.forbidden',
          message: 'Forbidden',
        };
      }

      vaults.push({ vaultId: vault.id, name: vault.name });
    }

    const selectedVaultIds = new Set(vaults.map((vault) => vault.vaultId));

    for (const requestedDocument of dedupeDocumentRefs(
      requestedContext.documents,
      selectedVaultIds,
    )) {
      const vault = await vaultServices.getVaultForUser({
        vaultId: requestedDocument.vaultId,
        userId,
      });

      if (vault === null) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }

      if (!canReadVault(vault)) {
        return {
          ok: false,
          status: 403,
          code: 'vault.forbidden',
          message: 'Forbidden',
        };
      }

      const document = await getDocumentContext({
        db,
        vaultId: requestedDocument.vaultId,
        documentId: requestedDocument.documentId,
      });

      if (document === null) {
        return { ok: false, status: 404, code: 'chat.not_found', message: 'Document not found' };
      }

      documents.push({
        vaultId: vault.id,
        documentId: document.id,
        name: document.name,
        vaultName: vault.name,
        ...(requestedDocument.path ? { path: requestedDocument.path } : {}),
      });
    }

    if (vaults.length === 0 && documents.length === 0) {
      return {
        ok: false,
        status: 400,
        code: 'chat.invalid_context',
        message: 'Context selection is empty',
      };
    }

    return { ok: true, scope: { type: 'selection', vaults, documents } };
  }

  if (requestedContext.vaultId.length === 0) {
    return { ok: false, status: 400, code: 'chat.invalid_context', message: 'vaultId is required' };
  }

  const vault = await vaultServices.getVaultForUser({ vaultId: requestedContext.vaultId, userId });

  if (vault === null) {
    return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
  }

  if (requestedContext.type === 'vault') {
    return canReadVault(vault)
      ? { ok: true, scope: { type: 'vault', vaultId: vault.id, vaultName: vault.name } }
      : {
          ok: false,
          status: 403,
          code: 'vault.forbidden',
          message: 'Forbidden',
        };
  }

  if (requestedContext.documentId.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'chat.invalid_context',
      message: 'documentId is required',
    };
  }

  if (!canReadVault(vault)) {
    return {
      ok: false,
      status: 403,
      code: 'vault.forbidden',
      message: 'Forbidden',
    };
  }

  const document = await getDocumentContext({
    db,
    vaultId: requestedContext.vaultId,
    documentId: requestedContext.documentId,
  });

  return document !== null
    ? {
        ok: true,
        scope: {
          type: 'document',
          vaultId: vault.id,
          documentId: document.id,
          vaultName: vault.name,
          documentName: document.name,
        },
      }
    : { ok: false, status: 404, code: 'chat.not_found', message: 'Document not found' };
}

export async function resolveUsableContext({
  context,
  snapshot,
  db,
  vaultServices,
}: {
  context: Context<ServerContext>;
  snapshot: ChatContextSnapshot;
  db: Database;
  vaultServices: VaultsServices;
}): Promise<ChatContextResolution> {
  const userId = getUserId(context);

  if (userId === null) {
    return { ok: false, status: 401, code: 'auth.unauthorized', message: 'Unauthorized' };
  }

  if (!context.get('canUseAI')) {
    return {
      ok: false,
      status: 403,
      code: 'authorization.use_ai_required',
      message: 'Use AI privilege required',
    };
  }

  if (snapshot.type === 'global') {
    for (const vaultId of snapshot.vaultIds) {
      const vault = await vaultServices.getVaultForUser({ vaultId, userId });
      if (vault === null || !canReadVault(vault)) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }
    }

    return snapshot.vaultIds.length > 0
      ? { ok: true, scope: snapshot }
      : {
          ok: false,
          status: 403,
          code: 'vault.forbidden',
          message: 'No readable vaults available',
        };
  }

  if (snapshot.type === 'selection') {
    if (snapshot.vaults.length === 0 && snapshot.documents.length === 0) {
      return {
        ok: false,
        status: 403,
        code: 'vault.forbidden',
        message: 'Forbidden',
      };
    }

    for (const vaultRef of dedupeVaultRefs(snapshot.vaults)) {
      const vault = await vaultServices.getVaultForUser({ vaultId: vaultRef.vaultId, userId });
      if (vault === null || !canReadVault(vault)) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }
    }

    const selectedVaultIds = new Set(
      dedupeVaultRefs(snapshot.vaults).map((vault) => vault.vaultId),
    );

    for (const documentRef of dedupeDocumentRefs(snapshot.documents, selectedVaultIds)) {
      const vault = await vaultServices.getVaultForUser({ vaultId: documentRef.vaultId, userId });
      if (vault === null || !canReadVault(vault)) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }

      const document = await getDocumentContext({
        db,
        vaultId: documentRef.vaultId,
        documentId: documentRef.documentId,
      });

      if (document === null) {
        return { ok: false, status: 404, code: 'chat.not_found', message: 'Document not found' };
      }
    }

    return { ok: true, scope: snapshot };
  }

  const vault = await vaultServices.getVaultForUser({ vaultId: snapshot.vaultId, userId });

  if (vault === null) {
    return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
  }

  if (snapshot.type === 'vault') {
    return canReadVault(vault)
      ? { ok: true, scope: snapshot }
      : {
          ok: false,
          status: 403,
          code: 'vault.forbidden',
          message: 'Forbidden',
        };
  }

  if (!canReadVault(vault)) {
    return {
      ok: false,
      status: 403,
      code: 'vault.forbidden',
      message: 'Forbidden',
    };
  }

  const document = await getDocumentContext({
    db,
    vaultId: snapshot.vaultId,
    documentId: snapshot.documentId,
  });
  return document !== null
    ? { ok: true, scope: snapshot }
    : { ok: false, status: 404, code: 'chat.not_found', message: 'Document not found' };
}

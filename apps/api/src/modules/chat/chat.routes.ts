import type { Context, Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultAccess } from '../vaults/vaults.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { ChatContextDocumentRef, ChatContextSnapshot, ChatContextVaultRef, ChatIntent } from './chat.types.js';
import type { ChatScopeInput, ChatServices } from './chat.services.js';
import { and, eq } from 'drizzle-orm';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { documentsTable } from '../database/schema/index.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

type ChatRouteErrorCode =
  | 'auth.unauthorized'
  | 'authorization.ai_access_required'
  | 'chat.invalid_content'
  | 'chat.invalid_context'
  | 'chat.invalid_intent'
  | 'chat.invalid_model'
  | 'chat.invalid_response_mode'
  | 'chat.invalid_title'
  | 'chat.model_options_unavailable'
  | 'chat.not_found'
  | 'vault.forbidden';

type ChatContextResolution =
  | { ok: true; scope: ChatScopeInput }
  | { ok: false; status: 400 | 401 | 403 | 404; code: ChatRouteErrorCode; message: string };

function routeError(
  context: Context<ServerContext>,
  { code, message, status }: { code: ChatRouteErrorCode; message: string; status: 400 | 401 | 403 | 404 | 502 },
) {
  return context.json({ error: { code, message } }, status);
}

function parseTitle(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' ? value.trim() : null;
}

function parseResponseMode(value: unknown) {
  if (value === undefined) {
    return 'multimodal' as const;
  }

  return value === 'text' || value === 'multimodal' ? value : null;
}

function parseModel(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIntent(value: unknown): ChatIntent | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value === 'search' || value === 'summarize' || value === 'compare' || value === 'extract'
    ? value
    : null;
}

function getUserId(context: Context<ServerContext>) {
  return context.get('userId');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item.trim() : '').filter(item => item.length > 0)
    : [];
}

function parseOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function dedupeVaultRefs(vaults: ChatContextVaultRef[]) {
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

function dedupeDocumentRefs(documents: ChatContextDocumentRef[]) {
  const seen = new Set<string>();
  const deduped: ChatContextDocumentRef[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (vaultId.length === 0 || documentId.length === 0 || seen.has(key)) {
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

function parseVaultRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeVaultRefs(value.map((item) => {
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
  }));
}

function parseDocumentRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeDocumentRefs(value.map((item) => {
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
  }));
}

function canReadVault(vault: VaultAccess) {
  return vault.role === 'owner' || vault.role === 'editor' || vault.role === 'viewer';
}

function canUseVaultChat(vault: VaultAccess) {
  return canReadVault(vault) && vault.aiAccessLevel === 'full';
}

function canUseDocumentChat(vault: VaultAccess) {
  return canReadVault(vault) && (vault.aiAccessLevel === 'document_chat' || vault.aiAccessLevel === 'full');
}

function parseRequestedContext(body: Record<string, unknown>): ChatContextSnapshot {
  const rawContext = isRecord(body.contextSnapshot)
    ? body.contextSnapshot
    : isRecord(body.context)
      ? body.context
      : body;
  const rawVaultRefs = parseVaultRefs(rawContext.vaults);
  const rawVaultIdRefs = parseStringArray(rawContext.vaultIds).map(vaultId => ({ vaultId }));
  const rawDocumentRefs = parseDocumentRefs(rawContext.documents);

  if (rawContext.type === 'selection' || rawVaultRefs.length > 0 || rawDocumentRefs.length > 0) {
    return {
      type: 'selection',
      vaults: dedupeVaultRefs([...rawVaultRefs, ...rawVaultIdRefs]),
      documents: rawDocumentRefs,
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

async function getDocumentContext({
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
    .where(and(
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
      eq(documentsTable.isDeleted, false),
    ))
    .limit(1);

  return document ?? null;
}

async function resolveCreatableContext({
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

  if (requestedContext.type === 'global') {
    const vaults = await vaultServices.listUserVaults({ userId });
    const vaultIds = vaults
      .filter(vault => vault.aiAccessLevel === 'full')
      .map(vault => vault.id);

    if (vaultIds.length === 0) {
      return {
        ok: false,
        status: 403,
        code: 'authorization.ai_access_required',
        message: 'AI access required',
      };
    }

    return { ok: true, scope: { type: 'global', vaultIds } };
  }

  if (requestedContext.type === 'selection') {
    const vaults: ChatContextVaultRef[] = [];
    const documents: ChatContextDocumentRef[] = [];

    for (const requestedVault of dedupeVaultRefs(requestedContext.vaults)) {
      const vault = await vaultServices.getVaultForUser({ vaultId: requestedVault.vaultId, userId });

      if (vault === null) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }

      if (!canUseVaultChat(vault)) {
        return {
          ok: false,
          status: 403,
          code: 'authorization.ai_access_required',
          message: 'Vault chat requires full AI access',
        };
      }

      vaults.push({ vaultId: vault.id, name: vault.name });
    }

    for (const requestedDocument of dedupeDocumentRefs(requestedContext.documents)) {
      const vault = await vaultServices.getVaultForUser({ vaultId: requestedDocument.vaultId, userId });

      if (vault === null) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }

      if (!canUseDocumentChat(vault)) {
        return {
          ok: false,
          status: 403,
          code: 'authorization.ai_access_required',
          message: 'Document chat requires document chat or full AI access',
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
      return { ok: false, status: 400, code: 'chat.invalid_context', message: 'Context selection is empty' };
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
    return canUseVaultChat(vault)
      ? { ok: true, scope: { type: 'vault', vaultId: vault.id, vaultName: vault.name } }
      : {
          ok: false,
          status: 403,
          code: 'authorization.ai_access_required',
          message: 'Vault chat requires full AI access',
        };
  }

  if (requestedContext.documentId.length === 0) {
    return { ok: false, status: 400, code: 'chat.invalid_context', message: 'documentId is required' };
  }

  if (!canUseDocumentChat(vault)) {
    return {
      ok: false,
      status: 403,
      code: 'authorization.ai_access_required',
      message: 'Document chat requires document chat or full AI access',
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

async function resolveUsableContext({
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

  if (snapshot.type === 'global') {
    for (const vaultId of snapshot.vaultIds) {
      const vault = await vaultServices.getVaultForUser({ vaultId, userId });
      if (vault === null || !canUseVaultChat(vault)) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }
    }

    return snapshot.vaultIds.length > 0
      ? { ok: true, scope: snapshot }
      : {
          ok: false,
          status: 403,
          code: 'authorization.ai_access_required',
          message: 'AI access required',
        };
  }

  if (snapshot.type === 'selection') {
    if (snapshot.vaults.length === 0 && snapshot.documents.length === 0) {
      return {
        ok: false,
        status: 403,
        code: 'authorization.ai_access_required',
        message: 'AI access required',
      };
    }

    for (const vaultRef of dedupeVaultRefs(snapshot.vaults)) {
      const vault = await vaultServices.getVaultForUser({ vaultId: vaultRef.vaultId, userId });
      if (vault === null || !canUseVaultChat(vault)) {
        return { ok: false, status: 403, code: 'vault.forbidden', message: 'Forbidden' };
      }
    }

    for (const documentRef of dedupeDocumentRefs(snapshot.documents)) {
      const vault = await vaultServices.getVaultForUser({ vaultId: documentRef.vaultId, userId });
      if (vault === null || !canUseDocumentChat(vault)) {
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
    return canUseVaultChat(vault)
      ? { ok: true, scope: snapshot }
      : { ok: false, status: 403, code: 'authorization.ai_access_required', message: 'AI access required' };
  }

  if (!canUseDocumentChat(vault)) {
    return { ok: false, status: 403, code: 'authorization.ai_access_required', message: 'AI access required' };
  }

  const document = await getDocumentContext({ db, vaultId: snapshot.vaultId, documentId: snapshot.documentId });
  return document !== null
    ? { ok: true, scope: snapshot }
    : { ok: false, status: 404, code: 'chat.not_found', message: 'Document not found' };
}

export function registerChatRoutes({
  app,
  db,
  services,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services: ChatServices;
  vaultServices?: VaultsServices;
}) {
  const vaultsServices = vaultServices ?? createVaultsServices({ db });

  app.use('/api/chats', requireAuthentication());

  app.get('/api/chats', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, { status: 401, code: 'auth.unauthorized', message: 'Unauthorized' });
    }

    return context.json(await services.listConversations({ userId }));
  });

  app.get('/api/chats/options', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, { status: 401, code: 'auth.unauthorized', message: 'Unauthorized' });
    }

    try {
      const options = await services.getModelOptions();
      return context.json({ options });
    } catch (error) {
      return routeError(context, {
        status: 502,
        code: 'chat.model_options_unavailable',
        message: error instanceof Error ? error.message : 'Could not load chat model options.',
      });
    }
  });

  app.post('/api/chats', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, { status: 401, code: 'auth.unauthorized', message: 'Unauthorized' });
    }

    const body = await context.req.json().catch(() => ({})) as Record<string, unknown>;
    const title = parseTitle(body.title);

    if (title === null) {
      return routeError(context, { status: 400, code: 'chat.invalid_title', message: 'title must be a string' });
    }

    const resolved = await resolveCreatableContext({
      context,
      requestedContext: parseRequestedContext(body),
      db,
      vaultServices: vaultsServices,
    });

    if (!resolved.ok) {
      return routeError(context, resolved);
    }

    return context.json(await services.createConversation({ scope: resolved.scope, userId, title }), 201);
  });

  app.get('/api/chats/:chatId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, { status: 401, code: 'auth.unauthorized', message: 'Unauthorized' });
    }

    const conversation = await services.getConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return routeError(context, { status: 404, code: 'chat.not_found', message: 'Chat not found' });
    }

    const resolved = await resolveUsableContext({
      context,
      snapshot: conversation.contextSnapshot,
      db,
      vaultServices: vaultsServices,
    });

    if (!resolved.ok) {
      return routeError(context, resolved);
    }

    return context.json({ conversation });
  });

  app.delete('/api/chats/:chatId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, { status: 401, code: 'auth.unauthorized', message: 'Unauthorized' });
    }

    const conversation = await services.getConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return routeError(context, { status: 404, code: 'chat.not_found', message: 'Chat not found' });
    }

    const resolved = await resolveUsableContext({
      context,
      snapshot: conversation.contextSnapshot,
      db,
      vaultServices: vaultsServices,
    });

    if (!resolved.ok) {
      return routeError(context, resolved);
    }

    const deleted = await services.deleteConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (!deleted) {
      return routeError(context, { status: 404, code: 'chat.not_found', message: 'Chat not found' });
    }

    return new Response(null, { status: 204 });
  });

  app.post('/api/chats/:chatId/messages/stream', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, { status: 401, code: 'auth.unauthorized', message: 'Unauthorized' });
    }

    const conversation = await services.getConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return routeError(context, { status: 404, code: 'chat.not_found', message: 'Chat not found' });
    }

    const resolved = await resolveUsableContext({
      context,
      snapshot: conversation.contextSnapshot,
      db,
      vaultServices: vaultsServices,
    });

    if (!resolved.ok) {
      return routeError(context, resolved);
    }

    const body = await context.req.json().catch(() => null) as {
      content?: unknown;
      intent?: unknown;
      responseMode?: unknown;
      model?: unknown;
    } | null;
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    const intent = parseIntent(body?.intent);
    const responseMode = parseResponseMode(body?.responseMode);
    const model = parseModel(body?.model);

    if (content.length === 0) {
      return routeError(context, { status: 400, code: 'chat.invalid_content', message: 'content must be a non-empty string' });
    }

    if (responseMode === null) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_response_mode',
        message: 'responseMode must be "text" or "multimodal"',
      });
    }

    if (intent === null) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_intent',
        message: 'intent must be "search", "summarize", "compare", or "extract"',
      });
    }

    if (model === null) {
      return routeError(context, { status: 400, code: 'chat.invalid_model', message: 'model must be a non-empty string' });
    }

    const stream = await services.createMessageStream({
      userId,
      chatId: context.req.param('chatId'),
      content,
      intent,
      responseMode,
      model,
    });

    if (stream === null) {
      return routeError(context, { status: 404, code: 'chat.not_found', message: 'Chat not found' });
    }

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  });
}

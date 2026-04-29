import type { Context, Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { ChatScopeInput, ChatServices } from './chat.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireVaultAccess, requireVaultPermission } from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

function parseTitle(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' ? value.trim() : null;
}

function getUserId(context: Context<ServerContext>) {
  return context.get('userId');
}

function getVaultId(context: Context<ServerContext>) {
  return context.get('vaultId');
}

async function getGlobalChatScope({
  context,
  vaultServices,
}: {
  context: Context<ServerContext>;
  vaultServices: VaultsServices;
}): Promise<ChatScopeInput | null> {
  const userId = getUserId(context);

  if (userId === null) {
    return null;
  }

  const vaults = await vaultServices.listUserVaults({ userId });
  const vaultIds = vaults
    .filter(vault => vault.permissions.includes('documents.read'))
    .map(vault => vault.id);

  return { type: 'global', vaultIds };
}

function getVaultChatScope(context: Context<ServerContext>): ChatScopeInput | null {
  const vaultId = getVaultId(context);
  return vaultId === null ? null : { type: 'vault', vaultId };
}

function getDocumentChatScope(context: Context<ServerContext>): ChatScopeInput | null {
  const vaultId = getVaultId(context);
  const documentId = context.req.param('documentId');

  if (vaultId === null || documentId === undefined || documentId.length === 0) {
    return null;
  }

  return { type: 'document', vaultId, documentId };
}

function createScopedChatHandlers({
  app,
  basePath,
  services,
  resolveScope,
}: {
  app: Hono<ServerContext>;
  basePath: string;
  services: ChatServices;
  resolveScope: (context: Context<ServerContext>) => Promise<ChatScopeInput | null> | ChatScopeInput | null;
}) {
  async function getScopeAndUser(context: Context<ServerContext>) {
    const userId = getUserId(context);

    if (userId === null) {
      return null;
    }

    const scope = await resolveScope(context);

    if (scope === null) {
      return null;
    }

    return { scope, userId };
  }

  app.get(basePath, async (context) => {
    const resolved = await getScopeAndUser(context);
    if (resolved === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    return context.json(await services.listConversations(resolved));
  });

  app.post(basePath, async (context) => {
    const resolved = await getScopeAndUser(context);
    if (resolved === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const body = await context.req.json().catch(() => ({})) as { title?: unknown };
    const title = parseTitle(body.title);

    if (title === null) {
      return context.json(
        { error: { code: 'chat.invalid_title', message: 'title must be a string' } },
        400,
      );
    }

    return context.json(await services.createConversation({ ...resolved, title }), 201);
  });

  app.get(`${basePath}/:chatId`, async (context) => {
    const resolved = await getScopeAndUser(context);
    if (resolved === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const conversation = await services.getConversation({
      ...resolved,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return context.json({ error: { code: 'chat.not_found', message: 'Chat not found' } }, 404);
    }

    return context.json({ conversation });
  });

  app.delete(`${basePath}/:chatId`, async (context) => {
    const resolved = await getScopeAndUser(context);
    if (resolved === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const deleted = await services.deleteConversation({
      ...resolved,
      chatId: context.req.param('chatId'),
    });

    if (!deleted) {
      return context.json({ error: { code: 'chat.not_found', message: 'Chat not found' } }, 404);
    }

    return new Response(null, { status: 204 });
  });

  app.post(`${basePath}/:chatId/messages/stream`, async (context) => {
    const resolved = await getScopeAndUser(context);
    if (resolved === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const body = await context.req.json().catch(() => null) as { content?: unknown } | null;
    const content = typeof body?.content === 'string' ? body.content.trim() : '';

    if (content.length === 0) {
      return context.json(
        { error: { code: 'chat.invalid_content', message: 'content must be a non-empty string' } },
        400,
      );
    }

    const stream = await services.createMessageStream({
      ...resolved,
      chatId: context.req.param('chatId'),
      content,
    });

    if (stream === null) {
      return context.json({ error: { code: 'chat.not_found', message: 'Chat not found' } }, 404);
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
  createScopedChatHandlers({
    app,
    basePath: '/api/chats',
    services,
    resolveScope: context => getGlobalChatScope({ context, vaultServices: vaultsServices }),
  });

  app.use('/api/vaults/:vaultId/chats', requireAuthentication());
  app.use('/api/vaults/:vaultId/chats', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/chats', requireVaultPermission('documents.read'));
  createScopedChatHandlers({
    app,
    basePath: '/api/vaults/:vaultId/chats',
    services,
    resolveScope: getVaultChatScope,
  });

  app.use('/api/vaults/:vaultId/documents/:documentId/chats', requireAuthentication());
  app.use(
    '/api/vaults/:vaultId/documents/:documentId/chats',
    requireVaultAccess({ services: vaultsServices }),
  );
  app.use('/api/vaults/:vaultId/documents/:documentId/chats', requireVaultPermission('documents.read'));
  createScopedChatHandlers({
    app,
    basePath: '/api/vaults/:vaultId/documents/:documentId/chats',
    services,
    resolveScope: getDocumentChatScope,
  });
}

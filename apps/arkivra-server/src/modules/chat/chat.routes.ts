import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { ChatServices } from './chat.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';
import {
  getLatestUserMessageContent,
  getUserId,
  hasUnsupportedDocumentVersionContext,
  isDeletedSourceResolution,
  parseIntent,
  parseMessages,
  parseModel,
  parseRequestedContext,
  parseResponseMode,
  parseTitle,
  resolveCreatableContext,
  resolveUsableContext,
  routeError,
  SOURCE_DOCUMENT_DELETED_CONTEXT,
} from './chat.route-helpers.js';

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
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    return context.json(await services.listConversations({ userId }));
  });

  app.get('/api/chats/options', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
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
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = parseTitle(body.title);

    if (title === null) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_title',
        message: 'title must be a string',
      });
    }

    if (hasUnsupportedDocumentVersionContext(body)) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_context',
        message: 'Explicit document versions are not supported in chat context yet',
      });
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

    return context.json(
      await services.createConversation({ scope: resolved.scope, userId, title }),
      201,
    );
  });

  app.get('/api/chats/:chatId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const conversation = await services.getConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    const resolved = await resolveUsableContext({
      context,
      snapshot: conversation.contextSnapshot,
      db,
      vaultServices: vaultsServices,
    });

    if (!resolved.ok) {
      if (isDeletedSourceResolution(resolved)) {
        return context.json({
          conversation: {
            ...conversation,
            contextAvailability: SOURCE_DOCUMENT_DELETED_CONTEXT,
          },
        });
      }

      return routeError(context, resolved);
    }

    return context.json({ conversation });
  });

  app.patch('/api/chats/:chatId/context', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (hasUnsupportedDocumentVersionContext(body)) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_context',
        message: 'Explicit document versions are not supported in chat context yet',
      });
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

    const result = await services.updatePristineConversationContext({
      userId,
      chatId: context.req.param('chatId'),
      scope: resolved.scope,
    });

    if (result.status === 'not_found') {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    if (result.status === 'not_pristine') {
      return routeError(context, {
        status: 409,
        code: 'chat.not_pristine',
        message: 'Conversation context can only be changed before the first message.',
      });
    }

    return context.json({ conversation: result.conversation });
  });

  app.delete('/api/chats/:chatId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const conversation = await services.getConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    const deleted = await services.deleteConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (!deleted) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    return new Response(null, { status: 204 });
  });

  app.post('/api/chats/:chatId/messages/stream', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const conversation = await services.getConversation({
      userId,
      chatId: context.req.param('chatId'),
    });

    if (conversation === null) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    const resolved = await resolveUsableContext({
      context,
      snapshot: conversation.contextSnapshot,
      db,
      vaultServices: vaultsServices,
    });

    const contextAvailability = conversation.contextAvailability;

    if (!resolved.ok) {
      if (contextAvailability.readOnly && isDeletedSourceResolution(resolved)) {
        return routeError(context, {
          status: 409,
          code: 'chat.context_unavailable',
          message: contextAvailability.message,
        });
      }

      return routeError(context, resolved);
    }

    if (contextAvailability.readOnly) {
      return routeError(context, {
        status: 409,
        code: 'chat.context_unavailable',
        message: contextAvailability.message,
      });
    }

    const body = (await context.req.json().catch(() => null)) as {
      messages?: unknown;
      intent?: unknown;
      responseMode?: unknown;
      model?: unknown;
    } | null;
    const messages = parseMessages(body?.messages);
    const content = getLatestUserMessageContent(messages);
    const intent = parseIntent(body?.intent);
    const responseMode = parseResponseMode(body?.responseMode);
    const model = parseModel(body?.model);

    if (messages.length === 0 || content.length === 0) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_content',
        message: 'messages must include a non-empty user text message',
      });
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
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_model',
        message: 'model must be a non-empty string',
      });
    }

    const stream = await services.createMessageStream({
      userId,
      chatId: context.req.param('chatId'),
      messages,
      intent,
      responseMode,
      model,
    });

    if (stream === null) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    return stream;
  });
}

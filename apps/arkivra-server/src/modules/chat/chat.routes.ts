import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
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
  parseIncludeCitations,
  parseIntent,
  parseMessages,
  parseModel,
  parseRequestedContext,
  parseResponseMode,
  resolveCreatableContext,
  resolveUsableContext,
  routeError,
  SOURCE_DOCUMENT_DELETED_CONTEXT,
  validateSubmittedChatMessages,
} from './chat.route-helpers.js';
import { MAX_CHAT_REQUEST_BYTES } from './chat.constants.js';
import type { ChatContextSnapshot, ChatMessage } from './chat.types.js';
import {
  createChatResumableStreamId,
  createResumableChatResponse,
  createResumeChatResponse,
} from './chat.resumable-streams.js';

function getSubmittedUserMessageContextSnapshot(messages: ChatMessage[]): ChatContextSnapshot | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const metadata = message.metadata as Record<string, unknown> | undefined;
    const custom = metadata?.custom;
    if (custom !== null && typeof custom === 'object' && !Array.isArray(custom)) {
      const snapshot = (custom as { contextSnapshot?: unknown }).contextSnapshot;
      if (snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
        return snapshot as ChatContextSnapshot;
      }
    }

    return null;
  }

  return null;
}

function hasRequestContextInput(body: Record<string, unknown>) {
  return (
    body.contextSnapshot !== undefined ||
    body.context !== undefined ||
    body.type === 'global' ||
    body.type === 'selection' ||
    body.type === 'vault' ||
    body.type === 'document' ||
    typeof body.vaultId === 'string' ||
    typeof body.documentId === 'string' ||
    Array.isArray(body.vaultIds) ||
    Array.isArray(body.vaults) ||
    Array.isArray(body.documents)
  );
}

function getMessageContextInput(messages: ChatMessage[]) {
  const messageContextSnapshot = getSubmittedUserMessageContextSnapshot(messages);
  return messageContextSnapshot === null ? null : { contextSnapshot: messageContextSnapshot };
}

function getRequestedContextInput({
  body,
  messages,
}: {
  body: Record<string, unknown>;
  messages: ChatMessage[];
}) {
  if (hasRequestContextInput(body)) return body;

  return getMessageContextInput(messages) ?? body;
}

function getSelectedContextTargetCount(scope: ChatContextSnapshot) {
  if (scope.type === 'vault' || scope.type === 'document') return 1;
  if (scope.type === 'selection') return scope.vaults.length + scope.documents.length;
  return 0;
}

function addDefaultIntentPrompt(
  messages: ChatMessage[],
  prompt: string,
): ChatMessage[] | null {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex === -1) return null;

  return messages.map((message, index) =>
    index === latestUserIndex
      ? {
          ...message,
          parts: [...message.parts, { type: 'text' as const, text: prompt }],
        }
      : message,
  );
}

function prepareSubmittedMessages({
  messages,
  content,
  intent,
  scope,
}: {
  messages: ChatMessage[];
  content: string;
  intent: 'search' | 'summarize' | 'compare' | 'extract' | undefined;
  scope: ChatContextSnapshot;
}) {
  const selectedTargetCount = getSelectedContextTargetCount(scope);

  if (intent === 'compare' && selectedTargetCount < 2) {
    return {
      ok: false as const,
      code: 'chat.invalid_context' as const,
      message: 'Select at least two documents or vaults to compare',
    };
  }

  if (content.length > 0) return { ok: true as const, messages };

  if (intent === 'summarize' && selectedTargetCount > 0) {
    return {
      ok: true as const,
      messages: addDefaultIntentPrompt(messages, 'Summarize the selected context.'),
    };
  }

  if (intent === 'compare') {
    return {
      ok: true as const,
      messages: addDefaultIntentPrompt(messages, 'Compare the selected context.'),
    };
  }

  return {
    ok: false as const,
    code: 'chat.invalid_content' as const,
    message: 'Select a document or vault before sending summarize without text',
  };
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

  app.use(
    '/api/chats/messages/stream',
    bodyLimit({
      maxSize: MAX_CHAT_REQUEST_BYTES,
      onError: context => context.json({
        error: {
          code: 'chat.payload_too_large',
          message: `Chat requests must be at most ${MAX_CHAT_REQUEST_BYTES} bytes`,
        },
      }, 413),
    }),
  );
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

    const title = typeof body.title === 'string' ? body.title : undefined;
    const conversation = await services.createConversation({
      userId,
      scope: resolved.scope,
      ...(title !== undefined ? { title } : {}),
    });

    return context.json({ conversation }, 201);
  });

  app.post('/api/chats/messages/stream', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
    const messageValidation = validateSubmittedChatMessages(body?.messages);
    if (!messageValidation.ok) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_content',
        message: messageValidation.message,
      });
    }
    const rawChatId = typeof body?.chatId === 'string'
      ? body.chatId
      : typeof body?.id === 'string' && body.id.startsWith('cht_')
        ? body.id
        : undefined;
    const chatId = typeof rawChatId === 'string' && rawChatId.trim().length > 0
      ? rawChatId.trim()
      : undefined;
    const messages = parseMessages(body?.messages);
    const content = getLatestUserMessageContent(messages);
    const intent = parseIntent(body?.intent);
    const responseMode = parseResponseMode(body?.responseMode ?? (chatId ? 'text' : undefined));
    const config = body?.config;
    const configModel = config !== null
      && typeof config === 'object'
      && !Array.isArray(config)
      && typeof (config as { modelName?: unknown }).modelName === 'string'
      ? (config as { modelName: string }).modelName
      : undefined;
    const configIncludeCitations = config !== null
      && typeof config === 'object'
      && !Array.isArray(config)
      ? (config as { includeCitations?: unknown }).includeCitations
      : undefined;
    const model = parseModel(body?.model ?? configModel);
    const includeCitations = parseIncludeCitations(
      body?.includeCitations ?? configIncludeCitations,
    );

    if (
      messages.length === 0 ||
      (content.length === 0 && intent !== 'summarize' && intent !== 'compare')
    ) {
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

    if (includeCitations === null) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_include_citations',
        message: 'includeCitations must be a boolean',
      });
    }

    if (chatId !== undefined) {
      const conversation = await services.getConversation({ userId, chatId });

      if (conversation === null) {
        return routeError(context, {
          status: 404,
          code: 'chat.not_found',
          message: 'Chat not found',
        });
      }

      let submittedScope;
      if (body !== null) {
        const requestedContextInput = hasRequestContextInput(body)
          ? body
          : getMessageContextInput(messages) ?? (
              conversation.messages.length === 0
                ? getRequestedContextInput({ body, messages })
                : null
            );

        if (requestedContextInput !== null && hasUnsupportedDocumentVersionContext(requestedContextInput)) {
          return routeError(context, {
            status: 400,
            code: 'chat.invalid_context',
            message: 'Explicit document versions are not supported in chat context yet',
          });
        }

        if (requestedContextInput !== null) {
          const resolvedSubmittedContext = await resolveCreatableContext({
            context,
            requestedContext: parseRequestedContext(requestedContextInput),
            db,
            vaultServices: vaultsServices,
          });

          if (!resolvedSubmittedContext.ok) {
            return routeError(context, resolvedSubmittedContext);
          }

          submittedScope = resolvedSubmittedContext.scope;
        }
      }

      const resolved = await resolveUsableContext({
        context,
        snapshot: submittedScope ?? conversation.contextSnapshot,
        db,
        vaultServices: vaultsServices,
      });

      if (!resolved.ok) {
        if (
          submittedScope === undefined &&
          conversation.contextAvailability.readOnly &&
          isDeletedSourceResolution(resolved)
        ) {
          return routeError(context, {
            status: 409,
            code: 'chat.context_unavailable',
            message: conversation.contextAvailability.message,
          });
        }

        return routeError(context, resolved);
      }

      if (submittedScope === undefined && conversation.contextAvailability.readOnly) {
        return routeError(context, {
          status: 409,
          code: 'chat.context_unavailable',
          message: conversation.contextAvailability.message,
        });
      }

      const preparedMessages = prepareSubmittedMessages({ messages, content, intent, scope: resolved.scope });
      if (!preparedMessages.ok || preparedMessages.messages === null) {
        return routeError(context, {
          status: 400,
          code: preparedMessages.ok ? 'chat.invalid_content' : preparedMessages.code,
          message: preparedMessages.ok
            ? 'messages must include a user message'
            : preparedMessages.message,
        });
      }

      const stream = await services.createMessageStream({
        userId,
        chatId,
        ...(submittedScope !== undefined ? { scope: submittedScope } : {}),
        messages: preparedMessages.messages,
        intent,
        responseMode,
        includeCitations,
        model,
      });

      if (stream === null) {
        return routeError(context, {
          status: 404,
          code: 'chat.not_found',
          message: 'Chat not found',
        });
      }

      return createResumableChatResponse({
        response: stream,
        streamId: createChatResumableStreamId({ userId, chatId }),
      });
    }

    if (body === null) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_context',
        message: 'Explicit document versions are not supported in chat context yet',
      });
    }

    const requestedContextInput = getRequestedContextInput({ body, messages });

    if (hasUnsupportedDocumentVersionContext(requestedContextInput)) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_context',
        message: 'Explicit document versions are not supported in chat context yet',
      });
    }

    const resolved = await resolveCreatableContext({
      context,
      requestedContext: parseRequestedContext(requestedContextInput),
      db,
      vaultServices: vaultsServices,
    });

    if (!resolved.ok) {
      return routeError(context, resolved);
    }

    const preparedMessages = prepareSubmittedMessages({ messages, content, intent, scope: resolved.scope });
    if (!preparedMessages.ok || preparedMessages.messages === null) {
      return routeError(context, {
        status: 400,
        code: preparedMessages.ok ? 'chat.invalid_content' : preparedMessages.code,
        message: preparedMessages.ok
          ? 'messages must include a user message'
          : preparedMessages.message,
      });
    }

    const stream = await services.createMessageStream({
      userId,
      scope: resolved.scope,
      messages: preparedMessages.messages,
      intent,
      responseMode,
      includeCitations,
      model,
    });

    if (stream === null) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    return createResumableChatResponse({
      response: stream,
      streamId: createChatResumableStreamId({ userId }),
    });
  });

  app.get('/api/chats/messages/stream/:streamId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    return createResumeChatResponse({
      streamId: context.req.param('streamId'),
      userId,
    });
  });

  app.patch('/api/chats/:chatId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
    const title = typeof body?.title === 'string' ? body.title : null;

    if (title === null) {
      return routeError(context, {
        status: 400,
        code: 'chat.invalid_content',
        message: 'title must be a string',
      });
    }

    const conversation = await services.renameConversation({
      userId,
      chatId: context.req.param('chatId'),
      title,
    });

    if (conversation === null) {
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    return context.json({ conversation });
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

  app.delete('/api/chats/:chatId', async (context) => {
    const userId = getUserId(context);
    if (userId === null) {
      return routeError(context, {
        status: 401,
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      });
    }

    const onlyIfEmpty = context.req.query('discardIfEmpty') === 'true';
    const deleted = await services.deleteConversation({
      userId,
      chatId: context.req.param('chatId'),
      ...(onlyIfEmpty ? { onlyIfEmpty: true } : {}),
    });

    if (!deleted) {
      if (onlyIfEmpty) {
        return new Response(null, { status: 204 });
      }
      return routeError(context, {
        status: 404,
        code: 'chat.not_found',
        message: 'Chat not found',
      });
    }

    return new Response(null, { status: 204 });
  });
}

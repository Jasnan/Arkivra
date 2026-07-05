import {
  RESUMABLE_STREAM_ID_HEADER,
  createInMemoryResumableStreamStore,
  createResumableStreamContext,
} from 'assistant-stream/resumable';
import { generateId } from '../database/schema/helpers.js';

const CHAT_RESUMABLE_STREAM_TTL_MS = 15 * 60 * 1000;
const chatResumableStreamOwners = new Map<string, string>();

export const chatResumableStreamContext = createResumableStreamContext({
  store: createInMemoryResumableStreamStore({
    defaultTtlMs: CHAT_RESUMABLE_STREAM_TTL_MS,
    maxStreams: 500,
    gcIntervalMs: CHAT_RESUMABLE_STREAM_TTL_MS,
  }),
  ttlMs: CHAT_RESUMABLE_STREAM_TTL_MS,
});

export function createChatResumableStreamId({
  userId,
  chatId,
}: {
  userId: string;
  chatId?: string;
}) {
  const streamId = `${chatId ?? 'chat'}.${generateId({ prefix: 'stm' })}`;
  chatResumableStreamOwners.set(streamId, userId);
  return streamId;
}

export async function createResumableChatResponse({
  response,
  streamId,
}: {
  response: Response;
  streamId: string;
}): Promise<Response> {
  if (response.body === null) {
    return response;
  }

  const stream = await chatResumableStreamContext.run(streamId, () => response.body!);
  const headers = new Headers(response.headers);
  headers.set(RESUMABLE_STREAM_ID_HEADER, streamId);

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function createResumeChatResponse({
  streamId,
  userId,
}: {
  streamId: string;
  userId: string;
}): Promise<Response> {
  if (chatResumableStreamOwners.get(streamId) !== userId) {
    return new Response(null, { status: 204 });
  }

  const stream = await chatResumableStreamContext.resume(streamId);
  if (stream === null) {
    chatResumableStreamOwners.delete(streamId);
    return new Response(null, { status: 204 });
  }

  return new Response(stream, {
    headers: {
      [RESUMABLE_STREAM_ID_HEADER]: streamId,
      'cache-control': 'no-cache',
      'content-type': 'text/event-stream; charset=utf-8',
    },
  });
}

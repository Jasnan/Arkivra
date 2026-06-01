import type {
  ChatModelConfig,
  ChatProvider,
  ChatProviderMetrics,
  ChatProviderStreamChunk,
} from './types.js';
import { z } from 'zod';

const ollamaChatChunkSchema = z.object({
  message: z.object({
    content: z.string().optional(),
  }).optional(),
  response: z.string().optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),
  total_duration: z.number().optional(),
  load_duration: z.number().optional(),
});

const ollamaTextResponseSchema = z.object({
  message: z.object({
    content: z.string().optional(),
  }).optional(),
  response: z.string().optional(),
  error: z.string().optional(),
});

const ollamaTagsResponseSchema = z.object({
  models: z.array(z.object({
    name: z.string().min(1),
  })).default([]),
});

function normalizeHost(host: string | undefined) {
  return (host ?? 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
}

function toOllamaMetrics(parsed: z.infer<typeof ollamaChatChunkSchema>): ChatProviderMetrics {
  return {
    promptEvalCount: parsed.prompt_eval_count ?? null,
    promptEvalDurationNs: parsed.prompt_eval_duration ?? null,
    evalCount: parsed.eval_count ?? null,
    evalDurationNs: parsed.eval_duration ?? null,
    totalDurationNs: parsed.total_duration ?? null,
    loadDurationNs: parsed.load_duration ?? null,
  };
}

async function readOllamaTextResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}`);
  }

  const payload = ollamaTextResponseSchema.parse(await response.json());
  if (payload.error) {
    throw new Error(payload.error);
  }

  const content = payload.message?.content ?? payload.response ?? '';
  if (content.trim().length === 0) {
    throw new Error('Ollama returned an empty response.');
  }

  return content;
}

export async function* parseOllamaChatStream(
  response: Response,
): AsyncGenerator<ChatProviderStreamChunk> {
  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}`);
  }

  if (response.body === null) {
    const body = ollamaChatChunkSchema.parse(await response.json());
    const token = body.message?.content ?? body.response ?? '';
    if (token.length > 0) {
      yield { token };
    }
    if (body.done) {
      yield { metrics: toOllamaMetrics(body) };
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = ollamaChatChunkSchema.parse(JSON.parse(trimmed));
      if (parsed.error) {
        throw new Error(parsed.error);
      }

      const token = parsed.message?.content ?? parsed.response ?? '';
      if (token.length > 0) {
        yield { token };
      }

      if (parsed.done) {
        yield { metrics: toOllamaMetrics(parsed) };
      }
    }

    if (done) {
      break;
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    const parsed = ollamaChatChunkSchema.parse(JSON.parse(tail));
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    const token = parsed.message?.content ?? parsed.response ?? '';
    if (token.length > 0) {
      yield { token };
    }

    if (parsed.done) {
      yield { metrics: toOllamaMetrics(parsed) };
    }
  }
}

export function createOllamaChatProvider({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}): ChatProvider {
  return {
    kind: 'ollama',
    async *streamChat({ messages, config, signal }) {
      const response = await fetchImpl(`${normalizeHost(config.baseUrl)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: config.model,
          stream: true,
          think: false,
          messages,
          options: {
            temperature: 0.1,
            ...(typeof config.options === 'object' ? config.options : {}),
          },
        }),
      });

      yield* parseOllamaChatStream(response);
    },
    async completeJson<T>({
      messages,
      config,
      signal,
    }: {
      messages: Parameters<NonNullable<ChatProvider['completeJson']>>[0]['messages'];
      config: ChatModelConfig;
      schema: unknown;
      signal?: AbortSignal;
    }): Promise<T> {
      const response = await fetchImpl(`${normalizeHost(config.baseUrl)}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          think: false,
          format: 'json',
          messages,
          options: {
            temperature: 0.1,
            ...(typeof config.options === 'object' ? config.options : {}),
          },
        }),
      });

      const rawContent = await readOllamaTextResponse(response);
      return JSON.parse(rawContent) as T;
    },
    async listModels(config: Partial<ChatModelConfig>) {
      const response = await fetchImpl(`${normalizeHost(config.baseUrl)}/api/tags`);

      if (!response.ok) {
        throw new Error(`Could not query Ollama models from ${normalizeHost(config.baseUrl)} (status ${response.status})`);
      }

      const body = ollamaTagsResponseSchema.parse(await response.json());
      return body.models.map(model => model.name).sort((left, right) => left.localeCompare(right));
    },
  };
}

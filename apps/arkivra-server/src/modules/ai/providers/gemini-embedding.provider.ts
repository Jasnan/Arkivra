import { z } from 'zod';
import type { EmbeddingProvider } from './types.js';
import { GEMINI_OPENAI_COMPATIBLE_BASE_URL } from './gemini.provider.js';

const DEFAULT_GEMINI_API_KEY_SECRET_REF = 'GEMINI_API_KEY';

const geminiEmbeddingsResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
      index: z.number().int().nonnegative().optional(),
    }).passthrough(),
  ),
});

function chunkIntoBatches<T>(items: T[], batchSize: number) {
  const normalizedBatchSize = Math.max(1, batchSize);
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += normalizedBatchSize) {
    batches.push(items.slice(index, index + normalizedBatchSize));
  }

  return batches;
}

function normalizeGeminiOpenAiBaseUrl(baseUrl: string | undefined) {
  return (baseUrl ?? GEMINI_OPENAI_COMPATIBLE_BASE_URL).trim().replace(/\/+$/, '');
}

function resolveApiKey(secretRef: string | undefined) {
  const normalizedSecretRef = secretRef?.trim() || DEFAULT_GEMINI_API_KEY_SECRET_REF;
  return process.env[normalizedSecretRef] ?? null;
}

async function readGeminiOpenAiError(response: Response) {
  try {
    const body = await response.json() as {
      error?: { message?: string; type?: string; code?: string };
    };
    const message = body.error?.message?.trim();
    const code = body.error?.code?.trim() || body.error?.type?.trim();
    if (message && code) return `${message} (${code})`;
    if (message) return message;
  } catch {
    // Fall through to a stable HTTP status message.
  }

  return `Gemini OpenAI-compatible embeddings endpoint returned status ${response.status}`;
}

export function createGeminiEmbeddingProvider({
  fetchImpl = fetch,
  batchSize = 32,
}: {
  fetchImpl?: typeof fetch;
  batchSize?: number;
} = {}): EmbeddingProvider {
  return {
    kind: 'gemini',
    async embed({ texts, config, signal }) {
      if (texts.length === 0) {
        return [];
      }

      const apiKey = resolveApiKey(config.apiKeySecretRef);
      if (apiKey === null) {
        throw new Error('Gemini API key environment variable is not configured on the API server.');
      }

      const baseUrl = normalizeGeminiOpenAiBaseUrl(config.baseUrl);
      const allVectors: number[][] = [];

      for (const batch of chunkIntoBatches(texts, batchSize)) {
        const response = await fetchImpl(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          signal,
          body: JSON.stringify({
            model: config.model,
            input: batch,
          }),
        });

        if (!response.ok) {
          throw new Error(await readGeminiOpenAiError(response));
        }

        const payload = geminiEmbeddingsResponseSchema.parse(await response.json());
        const vectors = [...payload.data]
          .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
          .map(item => item.embedding);

        allVectors.push(...vectors);
      }

      return allVectors;
    },
  };
}

import type { EmbeddingModelConfig, EmbeddingProvider } from './types.js';
import { z } from 'zod';

const ollamaEmbedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

const ollamaLegacyEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
});

type EndpointMode = 'embed' | 'embeddings';

function chunkIntoBatches<T>(items: T[], batchSize: number) {
  const normalizedBatchSize = Math.max(1, batchSize);
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += normalizedBatchSize) {
    batches.push(items.slice(index, index + normalizedBatchSize));
  }

  return batches;
}

function normalizeHost(host: string | undefined) {
  return (host ?? 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
}

function vectorLengthError({
  model,
  dimensions,
  actual,
  endpoint,
}: {
  model: string;
  dimensions: number;
  actual: number;
  endpoint: EndpointMode;
}) {
  return new Error(
    `Ollama embedding dimension mismatch for model "${model}" via /api/${endpoint}: expected ${dimensions}, received ${actual}`,
  );
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `status ${response.status}`;
  } catch {
    return `status ${response.status}`;
  }
}

function assertVectorDimensions({
  vectors,
  config,
  endpoint,
}: {
  vectors: number[][];
  config: EmbeddingModelConfig;
  endpoint: EndpointMode;
}) {
  for (const vector of vectors) {
    if (vector.length !== config.dimensions) {
      throw vectorLengthError({
        model: config.model,
        dimensions: config.dimensions,
        actual: vector.length,
        endpoint,
      });
    }
  }
}

async function embedBatch({
  host,
  model,
  texts,
  fetchImpl,
  signal,
}: {
  host: string;
  model: string;
  texts: string[];
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}) {
  return await fetchImpl(`${host}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });
}

async function embedOneLegacy({
  host,
  model,
  text,
  fetchImpl,
  signal,
}: {
  host: string;
  model: string;
  text: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}) {
  const response = await fetchImpl(`${host}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = ollamaLegacyEmbeddingResponseSchema.parse(await response.json());
  return payload.embedding;
}

export function createOllamaEmbeddingProvider({
  fetchImpl = fetch,
  batchSize = 16,
}: {
  fetchImpl?: typeof fetch;
  batchSize?: number;
} = {}): EmbeddingProvider {
  let endpointMode: EndpointMode | null = null;

  return {
    kind: 'ollama',
    async embed({ texts, config, signal }) {
      if (texts.length === 0) {
        return [];
      }

      const host = normalizeHost(config.baseUrl);
      const allVectors: number[][] = [];

      for (const batch of chunkIntoBatches(texts, batchSize)) {
        if (endpointMode !== 'embeddings') {
          const response = await embedBatch({
            host,
            model: config.model,
            texts: batch,
            fetchImpl,
            signal,
          });

          if (response.ok) {
            endpointMode = 'embed';
            const payload = ollamaEmbedResponseSchema.parse(await response.json());
            assertVectorDimensions({
              vectors: payload.embeddings,
              config,
              endpoint: 'embed',
            });
            allVectors.push(...payload.embeddings);
            continue;
          }

          if (response.status !== 404) {
            throw new Error(await readErrorMessage(response));
          }

          endpointMode = 'embeddings';
        }

        for (const text of batch) {
          const vector = await embedOneLegacy({
            host,
            model: config.model,
            text,
            fetchImpl,
            signal,
          });
          assertVectorDimensions({
            vectors: [vector],
            config,
            endpoint: 'embeddings',
          });
          allVectors.push(vector);
        }
      }

      if (config.options?.logRequests === true) {
        console.info(
          `[ollama-embedding-provider] embedded ${texts.length} texts with model=${config.model} via ${endpointMode === 'embeddings' ? '/api/embeddings' : '/api/embed'}`,
        );
      }

      return allVectors;
    },
  };
}

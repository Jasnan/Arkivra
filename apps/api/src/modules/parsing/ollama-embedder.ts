import { z } from 'zod';

export type RuntimeOllamaEmbeddingSettings = {
  enabled: boolean;
  host: string;
  model: string;
  dimensions: number;
  logRequests: boolean;
};

export interface ChunkEmbedder {
  readonly name: string;
  embed: (texts: string[]) => Promise<number[][]>;
}

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

function normalizeHost(host: string) {
  return host.trim().replace(/\/+$/, '');
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
  settings,
  endpoint,
}: {
  vectors: number[][];
  settings: RuntimeOllamaEmbeddingSettings;
  endpoint: EndpointMode;
}) {
  for (const vector of vectors) {
    if (vector.length !== settings.dimensions) {
      throw vectorLengthError({
        model: settings.model,
        dimensions: settings.dimensions,
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
}: {
  host: string;
  model: string;
  texts: string[];
  fetchImpl: typeof fetch;
}) {
  const response = await fetchImpl(`${host}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  return response;
}

async function embedOneLegacy({
  host,
  model,
  text,
  fetchImpl,
}: {
  host: string;
  model: string;
  text: string;
  fetchImpl: typeof fetch;
}) {
  const response = await fetchImpl(`${host}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

export function createRuntimeConfiguredOllamaEmbedder({
  resolveSettings,
  fetchImpl = fetch,
  batchSize = 16,
}: {
  resolveSettings: () => Promise<RuntimeOllamaEmbeddingSettings>;
  fetchImpl?: typeof fetch;
  batchSize?: number;
}): ChunkEmbedder {
  let endpointMode: EndpointMode | null = null;

  return {
    name: 'runtime-configured-ollama-embedder',
    embed: async (texts) => {
      if (texts.length === 0) {
        return [];
      }

      const settings = await resolveSettings();
      if (!settings.enabled) {
        return [];
      }

      const host = normalizeHost(settings.host);
      const allVectors: number[][] = [];

      for (const batch of chunkIntoBatches(texts, batchSize)) {
        if (endpointMode !== 'embeddings') {
          const response = await embedBatch({
            host,
            model: settings.model,
            texts: batch,
            fetchImpl,
          });

          if (response.ok) {
            endpointMode = 'embed';
            const payload = ollamaEmbedResponseSchema.parse(await response.json());
            assertVectorDimensions({
              vectors: payload.embeddings,
              settings,
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
            model: settings.model,
            text,
            fetchImpl,
          });
          assertVectorDimensions({
            vectors: [vector],
            settings,
            endpoint: 'embeddings',
          });
          allVectors.push(vector);
        }
      }

      if (settings.logRequests) {
        console.info(
          `[ollama-embedder] embedded ${texts.length} texts with model=${settings.model} via ${endpointMode === 'embeddings' ? '/api/embeddings' : '/api/embed'}`,
        );
      }

      return allVectors;
    },
  };
}

import { z } from 'zod';

const ollamaTagsResponseSchema = z.object({
  models: z.array(z.object({
    name: z.string().min(1),
    size: z.number().nullable().optional(),
    modified_at: z.string().nullable().optional(),
  })).default([]),
});

const ollamaGenerateResponseSchema = z.object({
  response: z.string().optional(),
});

const ollamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string().optional().default(''),
  }).optional().default({ content: '' }),
});

const ollamaEmbedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

const ollamaLegacyEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
});

export type OllamaEmbeddingEndpointMode = 'embed' | 'embeddings';

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
};

export type OllamaModel = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
};

function chunkIntoBatches<T>(items: T[], batchSize: number) {
  const normalizedBatchSize = Math.max(1, batchSize);
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += normalizedBatchSize) {
    batches.push(items.slice(index, index + normalizedBatchSize));
  }

  return batches;
}

export function normalizeOllamaHost(host: string | undefined) {
  return (host ?? 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
}

async function readJsonErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `status ${response.status}`;
  } catch {
    return `status ${response.status}`;
  }
}

async function readTextErrorMessage(response: Response) {
  return await response.text().catch(() => '');
}

async function readOllamaJsonError(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Ollama returned status ${response.status}`;
  } catch {
    return `Ollama returned status ${response.status}`;
  }
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
  endpoint: OllamaEmbeddingEndpointMode;
}) {
  return new Error(
    `Ollama embedding dimension mismatch for model "${model}" via /api/${endpoint}: expected ${dimensions}, received ${actual}`,
  );
}

function assertVectorDimensions({
  vectors,
  model,
  dimensions,
  endpoint,
}: {
  vectors: number[][];
  model: string;
  dimensions: number;
  endpoint: OllamaEmbeddingEndpointMode;
}) {
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw vectorLengthError({
        model,
        dimensions,
        actual: vector.length,
        endpoint,
      });
    }
  }
}

export function createOllamaProvider({
  fetchImpl = fetch,
  embeddingBatchSize = 16,
}: {
  fetchImpl?: typeof fetch;
  embeddingBatchSize?: number;
} = {}) {
  let endpointMode: OllamaEmbeddingEndpointMode | null = null;

  async function listModels({ host }: { host: string }): Promise<OllamaModel[]> {
    const normalizedHost = normalizeOllamaHost(host);
    const response = await fetchImpl(`${normalizedHost}/api/tags`);

    if (!response.ok) {
      throw new Error(`Could not query Ollama models from ${normalizedHost} (status ${response.status})`);
    }

    const body = ollamaTagsResponseSchema.parse(await response.json());

    return body.models
      .map(model => ({
        name: model.name,
        size: model.size ?? null,
        modifiedAt: model.modified_at ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function probeGenerate({
    host,
    model,
  }: {
    host: string;
    model: string;
  }) {
    const response = await fetchImpl(`${normalizeOllamaHost(host)}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'ping',
        stream: false,
        options: {
          num_predict: 1,
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(await readJsonErrorMessage(response));
    }

    ollamaGenerateResponseSchema.parse(await response.json());
  }

  async function chat({
    host,
    model,
    messages,
    options,
    signal,
    errorResponse = 'text',
  }: {
    host: string;
    model: string;
    messages: OllamaChatMessage[];
    options?: Record<string, unknown>;
    signal?: AbortSignal;
    errorResponse?: 'json' | 'text';
  }) {
    const response = await fetchImpl(`${normalizeOllamaHost(host)}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        ...(options === undefined ? {} : { options }),
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(
        errorResponse === 'json'
          ? await readOllamaJsonError(response)
          : await readTextErrorMessage(response),
      );
    }

    const payload = ollamaChatResponseSchema.parse(await response.json());
    return payload.message.content.trim();
  }

  async function embed({
    host,
    model,
    texts,
    dimensions,
    signal,
  }: {
    host?: string;
    model: string;
    texts: string[];
    dimensions: number;
    signal?: AbortSignal;
  }) {
    if (texts.length === 0) {
      return {
        embeddings: [],
        endpoint: endpointMode === 'embeddings' ? 'embeddings' as const : 'embed' as const,
      };
    }

    const normalizedHost = normalizeOllamaHost(host);
    const allVectors: number[][] = [];

    for (const batch of chunkIntoBatches(texts, embeddingBatchSize)) {
      if (endpointMode !== 'embeddings') {
        const response = await fetchImpl(`${normalizedHost}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            input: batch,
          }),
        });

        if (response.ok) {
          endpointMode = 'embed';
          const payload = ollamaEmbedResponseSchema.parse(await response.json());
          assertVectorDimensions({
            vectors: payload.embeddings,
            model,
            dimensions,
            endpoint: 'embed',
          });
          allVectors.push(...payload.embeddings);
          continue;
        }

        if (response.status !== 404) {
          throw new Error(await readJsonErrorMessage(response));
        }

        endpointMode = 'embeddings';
      }

      for (const text of batch) {
        const response = await fetchImpl(`${normalizedHost}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            prompt: text,
          }),
        });

        if (!response.ok) {
          throw new Error(await readJsonErrorMessage(response));
        }

        const payload = ollamaLegacyEmbeddingResponseSchema.parse(await response.json());
        assertVectorDimensions({
          vectors: [payload.embedding],
          model,
          dimensions,
          endpoint: 'embeddings',
        });
        allVectors.push(payload.embedding);
      }
    }

    return {
      embeddings: allVectors,
      endpoint: endpointMode === 'embeddings' ? 'embeddings' as const : 'embed' as const,
    };
  }

  async function resolveEmbeddingDimensions({
    host,
    model,
  }: {
    host: string;
    model: string;
  }) {
    const normalizedHost = normalizeOllamaHost(host);
    const embedResponse = await fetchImpl(`${normalizedHost}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        input: ['dimension probe'],
      }),
    });

    if (embedResponse.ok) {
      const payload = ollamaEmbedResponseSchema.parse(await embedResponse.json());
      const dimensions = payload.embeddings[0]?.length;
      if (dimensions === undefined || dimensions <= 0) {
        throw new Error(`Ollama returned an empty embedding for model "${model}".`);
      }

      return dimensions;
    }

    if (embedResponse.status !== 404) {
      throw new Error(await readJsonErrorMessage(embedResponse));
    }

    const legacyResponse = await fetchImpl(`${normalizedHost}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'dimension probe',
      }),
    });

    if (!legacyResponse.ok) {
      throw new Error(await readJsonErrorMessage(legacyResponse));
    }

    const payload = ollamaLegacyEmbeddingResponseSchema.parse(await legacyResponse.json());
    const dimensions = payload.embedding.length;
    if (dimensions === undefined || dimensions <= 0) {
      throw new Error(`Ollama returned an empty embedding for model "${model}".`);
    }

    return dimensions;
  }

  return {
    chat,
    embed,
    listModels,
    probeGenerate,
    resolveEmbeddingDimensions,
  };
}

export type OllamaProvider = ReturnType<typeof createOllamaProvider>;

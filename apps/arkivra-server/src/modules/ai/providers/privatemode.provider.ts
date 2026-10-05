import { z } from 'zod';
import type { EmbeddingProvider } from './types.js';

export const PRIVATEMODE_API_KEY_SECRET_REF = 'PRIVATEMODE_API_KEY';

/** This URL must identify a trusted Privatemode encryption proxy, not the remote API. */
export function privatemodeProxyBaseUrl() {
  const value = process.env.ARKIVRA_PRIVATEMODE_PROXY_URL?.trim();
  if (!value) throw new Error('Privatemode encryption proxy is not configured on the API server.');
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Privatemode proxy URL must be an HTTP(S) URL without credentials, query, or fragment.',
    );
  }
  if (url.hostname === 'api.privatemode.ai') {
    throw new Error('Configure a local Privatemode encryption proxy, not api.privatemode.ai.');
  }
  const base = value.replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

export function privatemodeApiKey(secretRef?: string | null) {
  const key = process.env[secretRef?.trim() || PRIVATEMODE_API_KEY_SECRET_REF];
  if (!key)
    throw new Error(
      'Privatemode API key environment variable is not configured on the API server.',
    );
  return key;
}

export function privatemodeProviderSettings() {
  try {
    const baseUrl = privatemodeProxyBaseUrl();
    return {
      baseUrl,
      apiKeySecretRef: PRIVATEMODE_API_KEY_SECRET_REF,
      configured: Boolean(process.env.PRIVATEMODE_API_KEY),
    };
  } catch {
    return { baseUrl: '', apiKeySecretRef: PRIVATEMODE_API_KEY_SECRET_REF, configured: false };
  }
}

const modelsSchema = z.object({
  data: z.array(z.object({ id: z.string(), tasks: z.array(z.string()) })),
});
const embeddingsSchema = z.object({
  data: z.array(
    z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()) }),
  ),
});

// Do not include provider response bodies: they may contain submitted document text.
async function proxyRequest(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  secretRef?: string,
) {
  const response = await fetchImpl(`${privatemodeProxyBaseUrl()}${path}`, {
    ...init,
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${privatemodeApiKey(secretRef)}`,
    },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Privatemode proxy returned HTTP ${response.status}.`);
  return response.json();
}

export async function listPrivatemodeModels(fetchImpl: typeof fetch = fetch) {
  const payload = modelsSchema.parse(await proxyRequest('/models', {}, fetchImpl));
  return payload.data.map((model) => ({
    name: model.id,
    size: null,
    modifiedAt: null,
    capabilities: [
      ...(model.tasks.includes('generate') && !/ocr/i.test(model.id) ? ['chat'] : []),
      ...(model.tasks.includes('vision') ? ['vision'] : []),
      ...(model.tasks.includes('embed') ? ['embedding'] : []),
    ],
    // This integration requests the supported 1024-dimensional Qwen representation.
    ...(model.id === 'qwen3-embedding-4b' ? { embeddingDimensions: 1024 } : {}),
    source: 'live' as const,
    available: true,
  }));
}

export function createPrivatemodeEmbeddingProvider({
  fetchImpl = fetch,
  batchSize = 16,
}: { fetchImpl?: typeof fetch; batchSize?: number } = {}): EmbeddingProvider {
  return {
    kind: 'privatemode',
    async embed({ texts, config, signal, purpose = 'document' }) {
      if (texts.length === 0) return [];
      if (config.dimensions !== 1024)
        throw new Error(
          'Privatemode embeddings require 1024 dimensions for Arkivra’s vector index.',
        );
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += Math.max(1, batchSize)) {
        const batch = texts.slice(start, start + Math.max(1, batchSize));
        const input =
          purpose === 'query' && config.model === 'qwen3-embedding-4b'
            ? batch.map(
                (text) =>
                  `Instruct: Given a document search query, retrieve relevant passages that answer the query\nQuery: ${text}`,
              )
            : batch;
        const payload = embeddingsSchema.parse(
          await proxyRequest(
            '/embeddings',
            {
              method: 'POST',
              signal,
              body: JSON.stringify({
                model: config.model,
                input,
                dimensions: config.dimensions,
                encoding_format: 'float',
              }),
            },
            fetchImpl,
            config.apiKeySecretRef,
          ),
        );
        const data = [...payload.data].sort((a, b) => a.index - b.index);
        if (
          data.length !== batch.length ||
          data.some(
            (item, index) => item.index !== index || item.embedding.length !== config.dimensions,
          )
        ) {
          throw new Error('Privatemode returned invalid embedding indexes or dimensions.');
        }
        vectors.push(...data.map((item) => item.embedding));
      }
      return vectors;
    },
  };
}

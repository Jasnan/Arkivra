import { z } from 'zod';

export const GEMINI_NATIVE_MODELS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_OPENAI_COMPATIBLE_BASE_URL = `${GEMINI_NATIVE_MODELS_BASE_URL}/openai`;
export const GEMINI_OPENAI_COMPATIBLE_MODELS_URL = `${GEMINI_OPENAI_COMPATIBLE_BASE_URL}/models`;

const geminiModelSchema = z.object({
  name: z.string().min(1),
  version: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  inputTokenLimit: z.number().int().positive().optional(),
  outputTokenLimit: z.number().int().positive().optional(),
  supportedGenerationMethods: z.array(z.string()).optional().default([]),
}).passthrough();

const geminiModelsResponseSchema = z.object({
  models: z.array(geminiModelSchema).default([]),
  nextPageToken: z.string().optional(),
});

const geminiOpenAiModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
    }).passthrough(),
  ).default([]),
});

export type GeminiModel = {
  name: string;
  displayName: string | null;
  description: string | null;
  supportedGenerationMethods: string[];
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  version: string | null;
  capabilities: string[];
  contextWindow: number | null;
  maxOutputTokens: number | null;
  providerMetadata: z.infer<typeof geminiModelSchema>;
};

function normalizeGeminiModelId(name: string) {
  return name.trim().replace(/^models\//, '');
}

function normalizeSupportedGenerationMethods(methods: readonly string[]) {
  return [
    ...new Set(
      methods
        .map(method => method.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    ),
  ];
}

function hasMethod(methods: readonly string[], method: string) {
  return methods.some(item => item.toLowerCase() === method.toLowerCase());
}

function supportsOpenAiChatCompletions({
  isOpenAiCompatible,
  supportedGenerationMethods,
}: {
  isOpenAiCompatible: boolean;
  supportedGenerationMethods: readonly string[];
}) {
  return isOpenAiCompatible && hasMethod(supportedGenerationMethods, 'generateContent');
}

function supportsOpenAiEmbeddings({
  isOpenAiCompatible,
  supportedGenerationMethods,
}: {
  isOpenAiCompatible: boolean;
  supportedGenerationMethods: readonly string[];
}) {
  return isOpenAiCompatible && hasMethod(supportedGenerationMethods, 'embedContent');
}

function supportsNativeChatCompletions(supportedGenerationMethods: readonly string[]) {
  return hasMethod(supportedGenerationMethods, 'generateContent');
}

function supportsNativeEmbeddings(supportedGenerationMethods: readonly string[]) {
  return hasMethod(supportedGenerationMethods, 'embedContent');
}

export function detectGeminiVisionCapability({
  modelId,
  displayName,
  description,
  supportedGenerationMethods,
}: {
  modelId: string;
  displayName: string | null;
  description: string | null;
  supportedGenerationMethods: readonly string[];
}) {
  if (!hasMethod(supportedGenerationMethods, 'generateContent')) {
    return false;
  }

  const searchable = [modelId, displayName, description]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return /\b(?:vision|visual|image|images|multimodal)\b/.test(searchable);
}

export function normalizeGeminiModel(
  model: z.infer<typeof geminiModelSchema>,
  {
    openAiCompatibleModelIds,
  }: {
    openAiCompatibleModelIds?: ReadonlySet<string>;
  } = {},
): GeminiModel {
  const modelId = normalizeGeminiModelId(model.name);
  const supportedGenerationMethods = normalizeSupportedGenerationMethods(
    model.supportedGenerationMethods,
  );
  const isOpenAiCompatible =
    openAiCompatibleModelIds === undefined || openAiCompatibleModelIds.has(modelId);
  const capabilities = new Set<string>();
  const supportsChat = supportsOpenAiChatCompletions({
    isOpenAiCompatible,
    supportedGenerationMethods,
  });

  if (supportsChat) {
    capabilities.add('chat');
  }

  if (supportsOpenAiEmbeddings({ isOpenAiCompatible, supportedGenerationMethods })) {
    capabilities.add('embedding');
  }

  const displayName = model.displayName ?? null;
  const description = model.description ?? null;

  if (
    supportsChat && detectGeminiVisionCapability({
      modelId,
      displayName,
      description,
      supportedGenerationMethods,
    })
  ) {
    capabilities.add('vision');
  }

  return {
    name: modelId,
    displayName,
    description,
    supportedGenerationMethods,
    inputTokenLimit: model.inputTokenLimit ?? null,
    outputTokenLimit: model.outputTokenLimit ?? null,
    version: model.version ?? null,
    capabilities: Array.from(capabilities).sort((left, right) => left.localeCompare(right)),
    contextWindow: model.inputTokenLimit ?? null,
    maxOutputTokens: model.outputTokenLimit ?? null,
    providerMetadata: model,
  };
}

async function readGeminiError(response: Response) {
  try {
    const body = await response.json() as {
      error?: { message?: string; status?: string };
    };
    const message = body.error?.message?.trim();
    const status = body.error?.status?.trim();
    if (message && status) return `${message} (${status})`;
    if (message) return message;
  } catch {
    // Fall through to a stable HTTP status message.
  }

  return `Google Gemini Models API returned status ${response.status}`;
}

function normalizeOpenAiCompatibleModelIds(models: Array<{ id: string }>) {
  return new Set(models.map(model => normalizeGeminiModelId(model.id)));
}

function looksLikeGeminiEmbeddingModelId(modelId: string) {
  return /\bembed(?:ding)?\b|embedding/i.test(modelId);
}

function inferOpenAiCompatibleCapabilities(modelId: string): string[] {
  if (looksLikeGeminiEmbeddingModelId(modelId)) {
    return ['embedding'];
  }

  return /^gemini-/i.test(modelId) ? ['chat'] : [];
}

function getNativeModelAliasesForOpenAiModelId(modelId: string) {
  const aliases = new Set([modelId]);

  if (looksLikeGeminiEmbeddingModelId(modelId)) {
    aliases.add(modelId.replace(/-preview$/i, ''));
  }

  return aliases;
}

function findNativeModelForOpenAiModel({
  modelId,
  nativeModelsById,
}: {
  modelId: string;
  nativeModelsById: ReadonlyMap<string, z.infer<typeof geminiModelSchema>>;
}) {
  for (const alias of getNativeModelAliasesForOpenAiModelId(modelId)) {
    const nativeModel = nativeModelsById.get(alias);
    if (nativeModel !== undefined) {
      return nativeModel;
    }
  }

  return undefined;
}

function createOpenAiCompatibleModel({
  modelId,
  nativeModel,
}: {
  modelId: string;
  nativeModel?: z.infer<typeof geminiModelSchema>;
}): GeminiModel {
  const supportedGenerationMethods = normalizeSupportedGenerationMethods(
    nativeModel?.supportedGenerationMethods ?? [],
  );
  const capabilities = new Set(
    supportedGenerationMethods.length > 0
      ? [
          ...(supportsNativeChatCompletions(supportedGenerationMethods) ? ['chat'] : []),
          ...(supportsNativeEmbeddings(supportedGenerationMethods) ? ['embedding'] : []),
        ]
      : inferOpenAiCompatibleCapabilities(modelId),
  );
  const displayName = nativeModel?.displayName ?? null;
  const description = nativeModel?.description ?? null;

  if (
    capabilities.has('chat') &&
    detectGeminiVisionCapability({
      modelId,
      displayName,
      description,
      supportedGenerationMethods,
    })
  ) {
    capabilities.add('vision');
  }

  return {
    name: modelId,
    displayName,
    description,
    supportedGenerationMethods,
    inputTokenLimit: nativeModel?.inputTokenLimit ?? null,
    outputTokenLimit: nativeModel?.outputTokenLimit ?? null,
    version: nativeModel?.version ?? null,
    capabilities: Array.from(capabilities).sort((left, right) => left.localeCompare(right)),
    contextWindow: nativeModel?.inputTokenLimit ?? null,
    maxOutputTokens: nativeModel?.outputTokenLimit ?? null,
    providerMetadata: {
      ...(nativeModel ?? {
        name: modelId,
        supportedGenerationMethods: [],
      }),
      openAiCompatibleModelId: modelId,
      source: nativeModel === undefined
        ? 'openai-compatible-models'
        : 'openai-compatible-models+native-models',
    },
  };
}

export function createGeminiProvider({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}) {
  async function listOpenAiCompatibleModelIds({ apiKey }: { apiKey: string }) {
    const response = await fetchImpl(GEMINI_OPENAI_COMPATIBLE_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Could not query Gemini OpenAI-compatible models: ${await readGeminiError(response)}`,
      );
    }

    const body = geminiOpenAiModelsResponseSchema.parse(await response.json());
    return normalizeOpenAiCompatibleModelIds(body.data);
  }

  async function listModels({
    apiKey,
  }: {
    apiKey: string;
  }): Promise<GeminiModel[]> {
    const openAiCompatibleModelIds = await listOpenAiCompatibleModelIds({ apiKey });
    const nativeModelsById = new Map<string, z.infer<typeof geminiModelSchema>>();
    let pageToken: string | undefined;

    try {
      do {
        const url = new URL(`${GEMINI_NATIVE_MODELS_BASE_URL}/models`);
        url.searchParams.set('pageSize', '1000');
        if (pageToken !== undefined) {
          url.searchParams.set('pageToken', pageToken);
        }

        const response = await fetchImpl(url, {
          headers: {
            'x-goog-api-key': apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`Could not query Gemini models: ${await readGeminiError(response)}`);
        }

        const body = geminiModelsResponseSchema.parse(await response.json());
        for (const model of body.models) {
          nativeModelsById.set(normalizeGeminiModelId(model.name), model);
        }
        pageToken = body.nextPageToken?.trim() || undefined;
      } while (pageToken !== undefined);
    } catch {
      nativeModelsById.clear();
    }

    return Array.from(openAiCompatibleModelIds)
      .map(modelId =>
        createOpenAiCompatibleModel({
          modelId,
          nativeModel: findNativeModelForOpenAiModel({ modelId, nativeModelsById }),
        }),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  return {
    listOpenAiCompatibleModelIds,
    listModels,
  };
}

export type GeminiProvider = ReturnType<typeof createGeminiProvider>;

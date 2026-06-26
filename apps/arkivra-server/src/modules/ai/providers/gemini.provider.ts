import { z } from 'zod';

export const GEMINI_NATIVE_MODELS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_OPENAI_COMPATIBLE_MODELS_URL = `${GEMINI_NATIVE_MODELS_BASE_URL}/openai/models`;

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
    const models: GeminiModel[] = [];
    const openAiCompatibleModelIds = await listOpenAiCompatibleModelIds({ apiKey });
    let pageToken: string | undefined;

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
      models.push(
        ...body.models
          .map(model => normalizeGeminiModel(model, { openAiCompatibleModelIds }))
          .filter(model => model.capabilities.includes('chat') || model.capabilities.includes('embedding')),
      );
      pageToken = body.nextPageToken?.trim() || undefined;
    } while (pageToken !== undefined);

    return models.sort((left, right) => left.name.localeCompare(right.name));
  }

  return {
    listOpenAiCompatibleModelIds,
    listModels,
  };
}

export type GeminiProvider = ReturnType<typeof createGeminiProvider>;

import { z } from 'zod';

export const aiModelProviders = ['ollama', 'gemini'] as const;
export const aiModelCapabilities = ['chat', 'vision', 'embedding'] as const;

export type AiModelProvider = typeof aiModelProviders[number];
export type AiModelCapability = typeof aiModelCapabilities[number];

export type AiModelCatalogEntry = {
  provider: AiModelProvider;
  model: string;
  label?: string;
  capabilities: AiModelCapability[];
  embeddingDimensions?: number;
};

const aiModelCatalogEntrySchema = z
  .object({
    provider: z.enum(aiModelProviders),
    model: z.string().trim().min(1),
    label: z.string().trim().min(1).optional(),
    capabilities: z.array(z.enum(aiModelCapabilities)).min(1),
    embeddingDimensions: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const hasEmbedding = entry.capabilities.includes('embedding');

    if (hasEmbedding && entry.embeddingDimensions === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['embeddingDimensions'],
        message: 'embeddingDimensions is required when capabilities includes embedding.',
      });
    }
  });

export const aiModelCatalogExtensionsSchema = z.array(aiModelCatalogEntrySchema);

export const builtInAiModelCatalog = [
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    capabilities: ['chat', 'vision'],
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    capabilities: ['chat', 'vision'],
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    capabilities: ['chat', 'vision'],
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    capabilities: ['chat', 'vision'],
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    capabilities: ['chat', 'vision'],
  },
] satisfies AiModelCatalogEntry[];

function formatCatalogIssue(issue: z.ZodIssue) {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

export function parseAiModelCatalogExtensions(raw: string | undefined): AiModelCatalogEntry[] {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS must be a valid JSON array: ${
        error instanceof Error ? error.message : 'invalid JSON'
      }`,
    );
  }

  const result = aiModelCatalogExtensionsSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS contains invalid model entries: ${
        result.error.issues.map(formatCatalogIssue).join('; ')
      }`,
    );
  }

  return result.data;
}

export function createAiModelCatalog({
  extensions = [],
}: {
  extensions?: readonly AiModelCatalogEntry[];
} = {}) {
  const entriesByKey = new Map<string, AiModelCatalogEntry>();

  for (const entry of [...builtInAiModelCatalog, ...extensions]) {
    if (entry.provider === 'ollama') continue;

    entriesByKey.set(`${entry.provider}:${entry.model}`, {
      ...entry,
      capabilities: [...entry.capabilities],
    });
  }

  return Array.from(entriesByKey.values()).sort(
    (left, right) =>
      left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model),
  );
}

export function hasCatalogCapability(
  entry: Pick<AiModelCatalogEntry, 'capabilities'>,
  capability: AiModelCapability,
) {
  return entry.capabilities.includes(capability);
}

export function findCatalogEntry(
  catalog: readonly AiModelCatalogEntry[],
  provider: AiModelProvider,
  model: string,
) {
  return catalog.find(entry => entry.provider === provider && entry.model === model) ?? null;
}

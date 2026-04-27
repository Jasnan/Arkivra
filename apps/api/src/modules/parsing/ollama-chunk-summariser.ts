import type { ParsedChunk } from './parsed-document.schema.js';
import { z } from 'zod';

export type RuntimeOllamaSummarisationSettings = {
  enabled: boolean;
  host: string;
  model: string;
  maxImagesPerChunk: number;
  logRequests: boolean;
};

export interface ChunkSummariser {
  readonly name: string;
  summarise: (chunk: ParsedChunk) => Promise<{
    enhancedContent: string | null;
    warnings: string[];
  }>;
}

const ollamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string().optional().default(''),
  }).optional().default({ content: '' }),
});

function previewSnippet(value: string, maxLength = 180) {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength)}...`;
}

async function readErrorMessage(response: Response) {
  return await response.text().catch(() => '');
}

function buildPrompt(chunk: ParsedChunk) {
  const tablesText = chunk.tablesHtml.length === 0
    ? '(none)'
    : chunk.tablesHtml.map((tableHtml, index) => `${index + 1}. ${tableHtml}`).join('\n\n');

  return [
    'You are creating a searchable description for document content retrieval.',
    'Output ONLY the description, no preface, no markdown fences.',
    '',
    'TEXT CONTENT:',
    chunk.originalText,
    '',
    'TABLES:',
    tablesText,
    '',
    'Generate a comprehensive, searchable description that covers:',
    '1. Key facts, numbers and data points from text and tables.',
    '2. Main topics and concepts discussed.',
    '3. Questions this content could answer.',
    '4. Visual content analysis (charts, diagrams, patterns in images).',
    '5. Alternative search terms users might use.',
    '',
    'Prioritise findability over brevity. Output language: same as input.',
  ].join('\n');
}

async function summariseChunk({
  host,
  model,
  chunk,
  maxImagesPerChunk,
  fetchImpl,
}: {
  host: string;
  model: string;
  chunk: ParsedChunk;
  maxImagesPerChunk: number;
  fetchImpl: typeof fetch;
}) {
  const selectedImages = chunk.images.slice(0, Math.max(0, maxImagesPerChunk));
  const response = await fetchImpl(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      options: {
        temperature: 0,
      },
      messages: [
        {
          role: 'user',
          content: buildPrompt(chunk),
          images: selectedImages.map(image => image.data.toString('base64')),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = ollamaChatResponseSchema.parse(await response.json());
  return payload.message.content.trim();
}

export function createNoopChunkSummariser(): ChunkSummariser {
  return {
    name: 'none',
    summarise: async () => ({
      enhancedContent: null,
      warnings: [],
    }),
  };
}

export function createRuntimeConfiguredOllamaChunkSummariser({
  resolveSettings,
  fetchImpl = fetch,
}: {
  resolveSettings: () => Promise<RuntimeOllamaSummarisationSettings>;
  fetchImpl?: typeof fetch;
}): ChunkSummariser {
  const noopSummariser = createNoopChunkSummariser();

  return {
    name: 'runtime-configured-ollama-chunk-summariser',
    summarise: async (chunk) => {
      if (chunk.tablesHtml.length === 0 && chunk.images.length === 0) {
        return noopSummariser.summarise(chunk);
      }

      let settings: RuntimeOllamaSummarisationSettings;
      try {
        settings = await resolveSettings();
      } catch (error) {
        return {
          enhancedContent: null,
          warnings: [
            error instanceof Error
              ? `ollama_chunk_summariser.settings_failed:${error.message}`
              : 'ollama_chunk_summariser.settings_failed',
          ],
        };
      }

      if (!settings.enabled) {
        return noopSummariser.summarise(chunk);
      }

      const cappedImageCount = Math.max(0, settings.maxImagesPerChunk);
      const warnings: string[] = [];
      if (chunk.images.length > cappedImageCount) {
        warnings.push(`ollama_chunk_summariser.image_limit:${cappedImageCount}/${chunk.images.length}`);
      }

      if (settings.logRequests) {
        console.info(
          `[ollama-chunk-summariser] summarising chunk ${chunk.id} with model=${settings.model}: ${previewSnippet(chunk.originalText)}`,
        );
      }

      try {
        const enhancedContent = await summariseChunk({
          host: settings.host,
          model: settings.model,
          chunk,
          maxImagesPerChunk: cappedImageCount,
          fetchImpl,
        });

        return {
          enhancedContent: enhancedContent.length > 0 ? enhancedContent : null,
          warnings,
        };
      } catch (error) {
        return {
          enhancedContent: null,
          warnings: [
            ...warnings,
            error instanceof Error
              ? `ollama_chunk_summariser.failed:${error.message}`
              : 'ollama_chunk_summariser.failed',
          ],
        };
      }
    },
  };
}

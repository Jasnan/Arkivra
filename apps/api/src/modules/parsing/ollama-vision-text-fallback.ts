import type { ParseInput } from './parser.types.js';
import type { ParserOutput, StructuredElement } from './parsed-document.schema.js';
import { z } from 'zod';

type EmbeddedImage = NonNullable<ParserOutput['embeddedImages']>[number];

export type EmptyTextFallbackResult = {
  output: Pick<ParserOutput, 'text' | 'markdown' | 'structuredElements'> | null;
  warnings: string[];
};

export interface EmptyTextFallback {
  readonly name: string;
  run: (input: ParseInput, raw: ParserOutput) => Promise<EmptyTextFallbackResult>;
}

export type RuntimeOllamaVisionFallbackSettings = {
  host: string;
  model: string;
  logRequests: boolean;
};

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

function isImageInput(mimeType: string) {
  return mimeType.toLowerCase().startsWith('image/');
}

async function readErrorMessage(response: Response) {
  return await response.text().catch(() => '');
}

async function transcribeImage({
  host,
  model,
  base64Image,
  fetchImpl,
}: {
  host: string;
  model: string;
  base64Image: string;
  fetchImpl: typeof fetch;
}) {
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
          content: [
            'Extract all readable text from this document image.',
            'Return only the extracted text.',
            'Preserve reading order and line breaks.',
            'Do not summarize, explain, or describe the image.',
            'If no text is readable, return an empty response.',
          ].join('\n'),
          images: [base64Image],
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

export function createRuntimeConfiguredOllamaVisionTextFallback({
  resolveSettings,
  loadImages,
  fetchImpl = fetch,
  maxImages = 8,
}: {
  resolveSettings: () => Promise<RuntimeOllamaVisionFallbackSettings>;
  loadImages?: (input: ParseInput, raw: ParserOutput) => Promise<EmbeddedImage[]>;
  fetchImpl?: typeof fetch;
  maxImages?: number;
}): EmptyTextFallback {
  return {
    name: 'ollama-vision',
    run: async (input, raw) => {
      const warnings: string[] = [];
      const embeddedImages = raw.embeddedImages ?? [];
      let images = embeddedImages.length > 0
        ? embeddedImages
        : isImageInput(input.mimeType)
          ? [{ mimeType: input.mimeType, data: input.fileData }]
          : [];

      if (images.length === 0 && loadImages !== undefined) {
        try {
          images = await loadImages(input, raw);
          if (images.length > 0) {
            warnings.push(`ollama_vision_fallback.loaded_images:${images.length}`);
          }
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `ollama_vision_fallback.load_images_failed:${error.message}`
              : 'ollama_vision_fallback.load_images_failed',
          );
        }
      }

      if (images.length === 0) {
        warnings.push('ollama_vision_fallback.no_images');
        return { output: null, warnings };
      }

      let settings: RuntimeOllamaVisionFallbackSettings;
      try {
        settings = await resolveSettings();
      } catch (error) {
        return {
          output: null,
          warnings: [
            error instanceof Error
              ? `ollama_vision_fallback.settings_failed:${error.message}`
              : 'ollama_vision_fallback.settings_failed',
          ],
        };
      }

      const selectedImages = images.slice(0, maxImages);
      const transcripts: Array<{ pageIndex: number; text: string }> = [];

      if (images.length > selectedImages.length) {
        warnings.push(`ollama_vision_fallback.image_limit:${selectedImages.length}/${images.length}`);
      }

      for (const [index, image] of selectedImages.entries()) {
        const base64Image = image.data.toString('base64');

        if (settings.logRequests) {
          console.info(
            `[ollama-vision-fallback] transcribing image ${index + 1}/${selectedImages.length} with model=${settings.model}`,
          );
        }

        try {
          const extractedText = await transcribeImage({
            host: settings.host,
            model: settings.model,
            base64Image,
            fetchImpl,
          });

          if (extractedText.length > 0) {
            transcripts.push({ pageIndex: index, text: extractedText });
            if (settings.logRequests) {
              console.info(
                `[ollama-vision-fallback] accepted transcription for image ${index + 1}: ${previewSnippet(extractedText)}`,
              );
            }
          }
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `ollama_vision_fallback.image_failed:${index + 1}:${error.message}`
              : `ollama_vision_fallback.image_failed:${index + 1}`,
          );
        }
      }

      const text = transcripts.map(transcript => transcript.text).join('\n\n').trim();
      if (text.length === 0) {
        warnings.push('ollama_vision_fallback.no_text');
        return {
          output: null,
          warnings,
        };
      }

      // Synthesise one narrative StructuredElement per transcribed page
      // so downstream chunking can attribute each fallback chunk to a
      // specific page (citation_precision='page'). The bbox stays null
      // because the vision model returns plain text only.
      const structuredElements: StructuredElement[] = transcripts.map(transcript => ({
        elementId: `ollama-vision-page-${transcript.pageIndex + 1}`,
        parentId: null,
        type: 'narrative',
        text: transcript.text,
        tableHtml: null,
        image: null,
        pageNumber: transcript.pageIndex + 1,
        bbox: null,
        section: null,
        sectionPath: [],
      }));

      warnings.unshift(`ollama_vision_fallback.used:${selectedImages.length}`);
      return {
        output: {
          text,
          markdown: '',
          structuredElements,
        },
        warnings,
      };
    },
  };
}

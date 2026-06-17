import type { OllamaProvider } from '../ai/providers/index.js';
import { createOllamaProvider } from '../ai/providers/index.js';

export type ImageCaptionerSettings = {
  enabled: boolean;
  host: string;
  model: string;
  logRequests: boolean;
};

export interface ImageCaptioner {
  readonly name: string;
  caption: (image: { mimeType: string; data: Buffer }) => Promise<string | null>;
}

async function captionImage({
  ollama,
  settings,
  model,
  base64Image,
}: {
  ollama: OllamaProvider;
  settings: ImageCaptionerSettings;
  model: string;
  base64Image: string;
}) {
  return await ollama.chat({
    host: settings.host,
    model,
    errorResponse: 'text',
    options: {
      temperature: 0,
    },
    messages: [
      {
        role: 'user',
        content: [
          'Describe this image in one concise sentence for semantic search.',
          'Focus on what the image depicts, its content, and key visual elements.',
          'Do not mention that it is an image or picture.',
          'Return only the description, nothing else.',
        ].join('\n'),
        images: [base64Image],
      },
    ],
  });
}

export function createRuntimeConfiguredOllamaImageCaptioner({
  resolveSettings,
  fetchImpl = fetch,
}: {
  resolveSettings: () => Promise<ImageCaptionerSettings>;
  fetchImpl?: typeof fetch;
}): ImageCaptioner {
  const ollama = createOllamaProvider({ fetchImpl });

  return {
    name: 'ollama-image-captioner',
    caption: async (image) => {
      const settings = await resolveSettings();
      if (!settings.enabled) {
        return null;
      }

      const base64Image = image.data.toString('base64');

      if (settings.logRequests) {
        console.info(
          `[ollama-image-captioner] captioning image with model=${settings.model}`,
        );
      }

      try {
        const caption = await captionImage({
          ollama,
          settings,
          model: settings.model,
          base64Image,
        });

        if (caption.length === 0) {
          return null;
        }

        return caption;
      } catch (error) {
        // Log error but don't fail the entire parsing process
        console.error(`[ollama-image-captioner] Failed to caption image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
      }
    },
  };
}

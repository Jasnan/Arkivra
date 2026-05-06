import { z } from 'zod';

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

const ollamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string().optional().default(''),
  }).optional().default({ content: '' }),
});

async function readErrorMessage(response: Response) {
  return await response.text().catch(() => '');
}

async function captionImage({
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
            'Describe this image in one concise sentence for semantic search.',
            'Focus on what the image depicts, its content, and key visual elements.',
            'Do not mention that it is an image or picture.',
            'Return only the description, nothing else.',
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

export function createRuntimeConfiguredOllamaImageCaptioner({
  resolveSettings,
  fetchImpl = fetch,
}: {
  resolveSettings: () => Promise<ImageCaptionerSettings>;
  fetchImpl?: typeof fetch;
}): ImageCaptioner {
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
          host: settings.host.trim().replace(/\/+$/, ''),
          model: settings.model,
          base64Image,
          fetchImpl,
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

import { z } from 'zod';

export const SUPPORTED_TRANSLATION_LANGUAGES = ['de', 'en'] as const;

export type TranslationTargetLanguage = typeof SUPPORTED_TRANSLATION_LANGUAGES[number];

export type TranslationSource =
  | {
      type: 'page-image';
      pageNumber: number;
      imageBase64: string;
      mimeType: 'image/png';
    }
  | {
      type: 'area-image';
      pageNumber: number;
      imageBase64: string;
      mimeType: 'image/png';
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  | {
      type: 'text';
      pageNumber?: number;
      text: string;
    };

export type DocumentTranslation = {
  targetLanguage: TranslationTargetLanguage;
  text: string;
  provider: string;
  model: string;
  sourceType: TranslationSource['type'];
};

export type RuntimeTranslationSettings = {
  enabled?: boolean;
  host: string;
  model: string;
  logRequests?: boolean;
};

export interface TranslationProvider {
  readonly name: string;
  translate: (args: {
    targetLanguage: TranslationTargetLanguage;
    source: TranslationSource;
    signal?: AbortSignal;
  }) => Promise<{
    text: string;
    model: string;
  }>;
}

const ollamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string().optional().default(''),
  }).optional().default({ content: '' }),
});

const TRANSLATION_SYSTEM_PROMPT = [
  'You are Arkivra\'s document translation engine.',
  'Your job is translation, not transcription.',
  'If the source is an image, perform OCR silently first, then translate the recognized content.',
  'Output only the final translation in the requested target language.',
  'Do not output the original source-language text unless it is already in the target language or is a proper noun, code, number, or identifier that should remain unchanged.',
].join('\n');

function languageName(language: TranslationTargetLanguage) {
  return language === 'de' ? 'German' : 'English';
}

function sourceLabel(source: TranslationSource) {
  if (source.type === 'text') {
    return 'selected PDF text';
  }

  return source.type === 'page-image'
    ? `rendered PDF page ${source.pageNumber}`
    : `selected visual region on PDF page ${source.pageNumber}`;
}

function buildPrompt({
  targetLanguage,
  source,
}: {
  targetLanguage: TranslationTargetLanguage;
  source: TranslationSource;
}) {
  const target = languageName(targetLanguage);

  if (source.type === 'page-image') {
    return [
      `TASK: Translate the rendered PDF page image into ${target}.`,
      `FINAL OUTPUT LANGUAGE: ${target}.`,
      '',
      'The attached image is one full PDF page. The source language is unknown.',
      'Step 1: Identify the source language or languages from the visible page content.',
      'Step 2: Read/OCR all visible text on the page silently.',
      `Step 3: Translate every readable sentence that is not already in ${target} into ${target}.`,
      'Step 4: Return only the translated page content.',
      '',
      'STRICT OUTPUT RULES:',
      `- The final answer must be in ${target}.`,
      '- Do not output the OCR transcript in the detected source language.',
      `- Do not copy source-language sentences into the answer when they should be translated into ${target}.`,
      '- Do not summarize. Translate the page content.',
      '- Preserve paragraph breaks, headings, lists, labels, and approximate table structure where possible.',
      '- Keep proper nouns, official names, codes, dates, numbers, and identifiers unchanged when appropriate.',
      '- Do not add commentary, explanations, prefaces, or markdown fences.',
      '',
      `Before responding, check your answer: if any translated sentence is still in a detected source language instead of ${target}, translate it before final output.`,
    ].join('\n');
  }

  const sharedInstructions = [
    `Target language: ${target}.`,
    `Translate the ${sourceLabel(source)} into ${target}.`,
    'Preserve readability, paragraph spacing, headings, lists, and approximate table structure where possible.',
    `Output only ${target} translated content. Do not add a preface, explanation, or markdown fence.`,
    'Do not return an OCR transcript in the source language.',
  ];

  if (source.type === 'text') {
    return [
      ...sharedInstructions,
      '',
      'TEXT:',
      source.text,
    ].join('\n');
  }

  return [
    ...sharedInstructions,
    'The attachment is a rendered image from the PDF viewer.',
    'OCR the visible text internally, then translate it. The final answer must be the translation, not the extracted source text.',
    source.type === 'area-image'
      ? 'Only translate content inside the selected region shown in the attachment.'
      : 'Only translate content from this page image.',
  ].join('\n');
}

function getOllamaImageAttachments(source: TranslationSource) {
  if (source.type === 'text') {
    return undefined;
  }

  return [source.imageBase64];
}

async function readOllamaError(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Ollama returned status ${response.status}`;
  } catch {
    return `Ollama returned status ${response.status}`;
  }
}

export function createRuntimeConfiguredOllamaTranslationProvider({
  resolveSettings,
  fetchImpl = fetch,
}: {
  resolveSettings: () => Promise<RuntimeTranslationSettings>;
  fetchImpl?: typeof fetch;
}): TranslationProvider {
  return {
    name: 'ollama',
    async translate({ targetLanguage, source, signal }) {
      const settings = await resolveSettings();
      if (settings.enabled === false) {
        throw new Error('AI features are disabled for this Arkivra instance.');
      }
      const host = settings.host.replace(/\/+$/, '');
      const prompt = buildPrompt({ targetLanguage, source });
      const images = getOllamaImageAttachments(source);

      if (settings.logRequests) {
        console.info(
          `[translation:ollama] translating ${source.type} with model=${settings.model} target=${targetLanguage}`,
        );
      }

      const response = await fetchImpl(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          think: false,
          messages: [
            {
              role: 'system',
              content: TRANSLATION_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: prompt,
              ...(images ? { images } : {}),
            },
          ],
          options: {
            temperature: 0,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readOllamaError(response));
      }

      const payload = ollamaChatResponseSchema.parse(await response.json());
      const text = payload.message.content.trim();

      if (text.length === 0) {
        throw new Error('Ollama returned an empty translation.');
      }

      return {
        text,
        model: settings.model,
      };
    },
  };
}

export function createDocumentTranslationServices({
  provider,
}: {
  provider: TranslationProvider;
}) {
  return {
    async translate({
      targetLanguage,
      source,
      signal,
    }: {
      targetLanguage: TranslationTargetLanguage;
      source: TranslationSource;
      signal?: AbortSignal;
    }): Promise<DocumentTranslation> {
      const result = await provider.translate({ targetLanguage, source, signal });

      return {
        targetLanguage,
        text: result.text,
        provider: provider.name,
        model: result.model,
        sourceType: source.type,
      };
    },
  };
}

export type DocumentTranslationServices = ReturnType<typeof createDocumentTranslationServices>;

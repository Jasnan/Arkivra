import { generateText } from 'ai';
import { createOllamaProvider } from '../ai/providers/index.js';
import { createChatModel } from '../chat/chat-ai-sdk.js';

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
  provider?: 'ollama' | 'gemini';
  host: string;
  model: string;
  apiKey?: string;
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
    provider?: string;
  }>;
}

const TRANSLATION_SYSTEM_PROMPT = [
  'You are Arkivra\'s document translation engine.',
  'Your job is translation, not transcription.',
  'Output only the final translation in the requested target language.',
].join('\n');

function languageInfo(language: TranslationTargetLanguage) {
  return {
    code: language,
    name: language === 'de' ? 'German' : 'English',
  };
}

function sourceLanguageInfoForTarget(targetLanguage: TranslationTargetLanguage) {
  return languageInfo(targetLanguage === 'en' ? 'de' : 'en');
}

function buildPrompt({
  targetLanguage,
  source,
}: {
  targetLanguage: TranslationTargetLanguage;
  source: TranslationSource;
}) {
  const sourceLanguage = sourceLanguageInfoForTarget(targetLanguage);
  const targetLanguageInfo = languageInfo(targetLanguage);

  const input = source.type === 'text' ? source.text : '{IMAGE}';

  return [
    `You are a professional ${sourceLanguage.name} (${sourceLanguage.code}) to ${targetLanguageInfo.name} (${targetLanguageInfo.code}) translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLanguage.name} text while adhering to ${targetLanguageInfo.name} grammar, vocabulary, and cultural sensitivities.`,
    `Produce only the ${targetLanguageInfo.name} translation, without any additional explanations or commentary. Please translate the following ${sourceLanguage.name} text into ${targetLanguageInfo.name}:`,
    '',
    input,
  ].join('\n');
}

function getOllamaImageAttachments(source: TranslationSource) {
  if (source.type === 'text') {
    return undefined;
  }

  return [source.imageBase64];
}

function getAiSdkUserContent({
  prompt,
  source,
}: {
  prompt: string;
  source: TranslationSource;
}) {
  if (source.type === 'text') {
    return prompt;
  }

  return [
    { type: 'text' as const, text: prompt },
    {
      type: 'file' as const,
      mediaType: source.mimeType,
      data: source.imageBase64,
    },
  ];
}

export function createRuntimeConfiguredOllamaTranslationProvider({
  resolveSettings,
  fetchImpl = fetch,
}: {
  resolveSettings: () => Promise<RuntimeTranslationSettings>;
  fetchImpl?: typeof fetch;
}): TranslationProvider {
  const ollama = createOllamaProvider({ fetchImpl });

  return {
    name: 'ollama',
    async translate({ targetLanguage, source, signal }) {
      const settings = await resolveSettings();
      if (settings.enabled === false) {
        throw new Error('AI features are disabled for this Arkivra instance.');
      }
      const provider = settings.provider ?? 'ollama';
      const prompt = buildPrompt({ targetLanguage, source });
      if (provider === 'gemini') {
        if (settings.logRequests) {
          console.info(
            `[translation:gemini] translating ${source.type} with model=${settings.model} target=${targetLanguage}`,
          );
        }

        const model = createChatModel({
          settings: {
            provider: 'gemini',
            baseUrl: settings.host,
            apiKey: settings.apiKey,
          },
          model: settings.model,
        });

        const result = await generateText({
          model,
          system: TRANSLATION_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: getAiSdkUserContent({ prompt, source }),
            },
          ],
          temperature: 0,
          abortSignal: signal,
        });
        const text = result.text.trim();

        if (text.length === 0) {
          throw new Error('Gemini returned an empty translation.');
        }

        return {
          text,
          model: settings.model,
          provider,
        };
      }

      const images = getOllamaImageAttachments(source);

      if (settings.logRequests) {
        console.info(
          `[translation:ollama] translating ${source.type} with model=${settings.model} target=${targetLanguage}`,
        );
      }

      const text = await ollama.chat({
        host: settings.host,
        model: settings.model,
        signal,
        errorResponse: 'json',
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
      });

      if (text.length === 0) {
        throw new Error('Ollama returned an empty translation.');
      }

      return {
        text,
        model: settings.model,
        provider,
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
        provider: result.provider ?? provider.name,
        model: result.model,
        sourceType: source.type,
      };
    },
  };
}

export type DocumentTranslationServices = ReturnType<typeof createDocumentTranslationServices>;

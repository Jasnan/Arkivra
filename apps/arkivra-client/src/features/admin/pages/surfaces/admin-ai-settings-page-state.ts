import type {
  AdminAiProviderSettings,
  AdminAiSettings,
} from '@/features/admin/admin.types';

export const emptyAiSettings: AdminAiSettings = {
  aiFeaturesEnabled: false,
  chat: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: '',
    allowedModels: [],
  },
  translation: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: '',
  },
  embedding: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: 'bge-m3',
    dimensions: 1024,
  },
  providers: {
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKeySecretRef: null,
    },
  },
  ollamaHost: '',
  model: '',
};

export type AiSettingsDraftOverride = Partial<
  Omit<AdminAiSettings, 'chat' | 'translation' | 'embedding'>
> & {
  chat?: Partial<AdminAiSettings['chat']>;
  translation?: Partial<AdminAiProviderSettings>;
  embedding?: Partial<AdminAiSettings['embedding']>;
};

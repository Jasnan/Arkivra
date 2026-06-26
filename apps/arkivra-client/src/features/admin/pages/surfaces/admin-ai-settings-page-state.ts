import type { AdminAiProviderSettings, AdminAiSettings } from '@/features/admin/admin.types';

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
    provider: null,
    baseUrl: '',
    apiKeySecretRef: null,
    model: null,
    dimensions: null,
  },
  providers: {
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKeySecretRef: null,
      configured: false,
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

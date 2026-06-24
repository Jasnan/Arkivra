import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createTimestampColumns } from './helpers.js';

export const instanceSettingsTable = pgTable('instance_settings', {
  id: text('id').primaryKey(),
  ...createTimestampColumns(),
  aiFeaturesEnabled: boolean('ai_features_enabled').notNull().default(false),

  // Provider-neutral chat settings. Legacy Ollama fields remain populated for
  // older runtime callers and existing self-hosted deployments.
  chatProvider: text('chat_provider').notNull().default('ollama'),
  chatBaseUrl: text('chat_base_url'),
  chatApiKeySecretRef: text('chat_api_key_secret_ref'),
  chatModel: text('chat_model'),
  chatAllowedModels: jsonb('chat_allowed_models').$type<string[]>().notNull().default([]),

  geminiApiKeySecretRef: text('gemini_api_key_secret_ref'),

  ollamaHost: text('ollama_host').notNull().default('http://127.0.0.1:11434'),
  ollamaModel: text('ollama_model').notNull().default('gemma4:e4b'),

  ollamaTranslationModel: text('ollama_translation_model').notNull().default('gemma4:e4b'),
  translationProvider: text('translation_provider').notNull().default('ollama'),
  translationBaseUrl: text('translation_base_url'),
  translationApiKeySecretRef: text('translation_api_key_secret_ref'),
  ollamaEmbeddingEnabled: boolean('ollama_embedding_enabled').notNull().default(false),
  ollamaEmbeddingHost: text('ollama_embedding_host').notNull().default('http://127.0.0.1:11434'),
  ollamaEmbeddingModel: text('ollama_embedding_model').notNull().default('bge-m3'),
  ollamaEmbeddingDimensions: integer('ollama_embedding_dimensions').notNull().default(1024),
});

import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createTimestampColumns } from './helpers.js';

export const instanceSettingsTable = pgTable('instance_settings', {
  id: text('id').primaryKey(),
  ...createTimestampColumns(),
  aiNormalizationEnabled: boolean('ai_normalization_enabled').notNull().default(false),
  ollamaHost: text('ollama_host').notNull().default('http://127.0.0.1:11434'),
  ollamaModel: text('ollama_model').notNull().default('gemma4:e2b'),
  ollamaGluedWordMinTokenLength: integer('ollama_glued_word_min_token_length').notNull().default(12),
  ollamaGluedWordMaxCandidates: integer('ollama_glued_word_max_candidates').notNull().default(100),
  ollamaGluedWordBatchSize: integer('ollama_glued_word_batch_size').notNull().default(10),

  // Multimodal RAG ingestion controls (added in 0011_summarisation_settings.sql).
  aiSummarisationEnabled: boolean('ai_summarisation_enabled').notNull().default(true),
  ollamaSummarisationModel: text('ollama_summarisation_model').notNull().default('gemma4:e2b'),
  ollamaSummarisationMaxImagesPerChunk: integer('ollama_summarisation_max_images_per_chunk')
    .notNull()
    .default(4),
  ollamaEmbeddingEnabled: boolean('ollama_embedding_enabled').notNull().default(true),
  ollamaEmbeddingModel: text('ollama_embedding_model').notNull().default('nomic-embed-text'),
  ollamaEmbeddingDimensions: integer('ollama_embedding_dimensions').notNull().default(768),
});

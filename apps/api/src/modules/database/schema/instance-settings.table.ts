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
  ollamaLogRequests: boolean('ollama_log_requests').notNull().default(false),
});

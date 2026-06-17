import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';

export type AiProviderCapability = 'chat' | 'embedding';
export type AiProviderKind = 'ollama' | 'openrouter' | 'gemini' | 'voyage' | 'custom';

export const aiProviderConfigsTable = pgTable(
  'ai_provider_configs',
  {
    ...createPrimaryKeyField({ prefix: 'aip' }),
    capability: text('capability').$type<AiProviderCapability>().notNull(),
    provider: text('provider').$type<AiProviderKind>().notNull(),
    name: text('name').notNull(),
    baseUrl: text('base_url'),
    model: text('model').notNull(),
    dimensions: integer('dimensions'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    apiKeySecretRef: text('api_key_secret_ref'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    ...createTimestampColumns(),
  },
  (table) => [
    index('ai_provider_configs_capability_enabled_idx').on(table.capability, table.isEnabled),
  ],
);

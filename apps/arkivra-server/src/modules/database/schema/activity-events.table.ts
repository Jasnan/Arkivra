import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField } from './helpers.js';

export const activityEventsTable = pgTable(
  'activity_events',
  {
    ...createPrimaryKeyField({ prefix: 'act' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    activityType: text('activity_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    vaultId: text('vault_id'),
    documentId: text('document_id'),
    actorId: text('actor_id'),
    actorType: text('actor_type').notNull().default('unknown'),
    actorDisplayName: text('actor_display_name'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    targetDisplayName: text('target_display_name'),
    source: text('source').notNull().default('api'),
    visibility: text('visibility').notNull().default('vault_members'),
    metadata: jsonb('metadata_json').$type<Record<string, unknown>>(),
    auditEventId: text('audit_event_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => [
    index('activity_events_vault_occurred_idx').on(table.vaultId, table.occurredAt),
    index('activity_events_document_occurred_idx').on(table.documentId, table.occurredAt),
    index('activity_events_actor_occurred_idx').on(table.actorId, table.occurredAt),
    index('activity_events_type_occurred_idx').on(table.activityType, table.occurredAt),
    index('activity_events_entity_occurred_idx').on(table.entityType, table.entityId, table.occurredAt),
  ],
);

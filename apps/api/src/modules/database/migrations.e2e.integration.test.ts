import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Resolve the drizzle migrations folder relative to this file so the
// test works whether vitest is invoked from the monorepo root or from
// inside apps/api.
const drizzleFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

// Smoke test for the multimodal RAG ingestion schema (Phase 0).
// Spins up an isolated Postgres database, runs every migration in
// apps/api/drizzle, and asserts that the columns/tables/indexes
// introduced by 0009/0010/0011 exist with the expected types and
// defaults. Existing columns and indexes are also re-checked so that a
// future re-numbering or accidental column drop fails loudly here.

describe.sequential('migrations smoke', () => {
  let adminPool: Pool | null = null;
  let pool: Pool | null = null;
  let isolatedDatabaseName = '';
  let isolatedDatabaseUrl = '';

  beforeAll(async () => {
    const baseDatabaseUrl =
      process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra';

    const adminUrl = new URL(baseDatabaseUrl);
    adminUrl.pathname = '/postgres';

    isolatedDatabaseName = `arkivra_migrations_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    isolatedDatabaseUrl = new URL(baseDatabaseUrl).toString().replace(
      /\/[^/?]+(\?.*)?$/,
      `/${isolatedDatabaseName}$1`,
    );

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${isolatedDatabaseName}"`);

    const migrationPool = new Pool({ connectionString: isolatedDatabaseUrl });
    const migrationDb = drizzle(migrationPool);
    try {
      await migrate(migrationDb, {
        migrationsFolder: drizzleFolder,
      });
    } finally {
      await migrationPool.end();
    }

    pool = new Pool({ connectionString: isolatedDatabaseUrl });
  });

  afterAll(async () => {
    await pool?.end();

    if (adminPool !== null && isolatedDatabaseName.length > 0) {
      await adminPool.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [isolatedDatabaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${isolatedDatabaseName}"`);
      await adminPool.end();
    }
  });

  test('0009 adds citation-grade provenance columns to document_chunks', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_chunks'
          AND column_name IN (
            'page_start',
            'page_end',
            'bounding_boxes',
            'source_element_ids',
            'parent_element_id',
            'original_text',
            'tables_html',
            'citation_precision'
          )
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.page_start?.data_type).toBe('integer');
    expect(byName.page_start?.is_nullable).toBe('YES');

    expect(byName.page_end?.data_type).toBe('integer');
    expect(byName.page_end?.is_nullable).toBe('YES');

    expect(byName.bounding_boxes?.data_type).toBe('jsonb');
    expect(byName.source_element_ids?.data_type).toBe('jsonb');
    expect(byName.tables_html?.data_type).toBe('jsonb');

    expect(byName.parent_element_id?.data_type).toBe('text');
    expect(byName.original_text?.data_type).toBe('text');

    expect(byName.citation_precision?.data_type).toBe('text');
    expect(byName.citation_precision?.is_nullable).toBe('NO');
    expect(byName.citation_precision?.column_default).toContain("'document'");
  });

  test('0009 creates the document_chunks_page_idx index', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'document_chunks'
          AND indexname = 'document_chunks_page_idx'
      `,
    );

    expect(rows).toHaveLength(1);
  });

  test('0010 creates the document_chunk_assets table with the expected shape', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_chunk_assets'
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.id?.data_type).toBe('text');
    expect(byName.id?.is_nullable).toBe('NO');

    expect(byName.chunk_id?.is_nullable).toBe('NO');
    expect(byName.document_id?.is_nullable).toBe('NO');
    expect(byName.vault_id?.is_nullable).toBe('NO');
    expect(byName.asset_type?.is_nullable).toBe('NO');

    expect(byName.mime_type?.is_nullable).toBe('YES');
    expect(byName.storage_key?.is_nullable).toBe('YES');
    expect(byName.inline_payload?.is_nullable).toBe('YES');
    expect(byName.bbox?.data_type).toBe('jsonb');
    expect(byName.byte_size?.data_type).toBe('integer');
    expect(byName.page_number?.data_type).toBe('integer');
    expect(byName.sha256_hash?.data_type).toBe('text');

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'document_chunk_assets'
        ORDER BY indexname
      `,
    );

    const indexNames = indexRows.map((row) => row.indexname);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'document_chunk_assets_chunk_idx',
        'document_chunk_assets_vault_doc_idx',
      ]),
    );
  });

  test('0010 wires document_chunk_assets foreign keys with ON DELETE CASCADE', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      column_name: string;
      foreign_table_name: string;
      delete_rule: string;
    }>(
      `
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = 'document_chunk_assets'
      `,
    );

    const byColumn = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byColumn.chunk_id?.foreign_table_name).toBe('document_chunks');
    expect(byColumn.chunk_id?.delete_rule).toBe('CASCADE');

    expect(byColumn.document_id?.foreign_table_name).toBe('documents');
    expect(byColumn.document_id?.delete_rule).toBe('CASCADE');

    expect(byColumn.vault_id?.foreign_table_name).toBe('vaults');
    expect(byColumn.vault_id?.delete_rule).toBe('CASCADE');
  });

  test('0011 adds summarisation + embedding columns to instance_settings', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'instance_settings'
          AND column_name IN (
            'ai_summarisation_enabled',
            'ollama_summarisation_model',
            'ollama_summarisation_max_images_per_chunk',
            'ollama_embedding_enabled',
            'ollama_embedding_model',
            'ollama_embedding_dimensions'
          )
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.ai_summarisation_enabled?.data_type).toBe('boolean');
    expect(byName.ai_summarisation_enabled?.is_nullable).toBe('NO');
    expect(byName.ai_summarisation_enabled?.column_default).toContain('true');

    expect(byName.ollama_summarisation_model?.data_type).toBe('text');
    expect(byName.ollama_summarisation_model?.column_default).toContain("'gemma4:e2b'");

    expect(byName.ollama_summarisation_max_images_per_chunk?.data_type).toBe('integer');
    expect(byName.ollama_summarisation_max_images_per_chunk?.column_default).toContain('4');

    expect(byName.ollama_embedding_enabled?.data_type).toBe('boolean');
    expect(byName.ollama_embedding_enabled?.column_default).toContain('true');

    expect(byName.ollama_embedding_model?.data_type).toBe('text');
    expect(byName.ollama_embedding_model?.column_default).toContain("'nomic-embed-text'");

    expect(byName.ollama_embedding_dimensions?.data_type).toBe('integer');
    expect(byName.ollama_embedding_dimensions?.column_default).toContain('768');
  });

  test('0012 adds encryption metadata columns to document_chunk_assets', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_chunk_assets'
          AND column_name IN (
            'file_encryption_key_wrapped',
            'file_encryption_kek_version'
          )
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.file_encryption_key_wrapped?.data_type).toBe('text');
    expect(byName.file_encryption_key_wrapped?.is_nullable).toBe('YES');

    expect(byName.file_encryption_kek_version?.data_type).toBe('text');
    expect(byName.file_encryption_kek_version?.is_nullable).toBe('YES');
  });

  test('0015 creates chat conversation and message tables', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: columns } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('chat_conversations', 'chat_messages')
      `,
    );

    const columnKeys = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));

    expect(columnKeys).toContain('chat_conversations.vault_id');
    expect(columnKeys).toContain('chat_conversations.created_by');
    expect(columnKeys).toContain('chat_conversations.title');
    expect(columnKeys).toContain('chat_conversations.deleted_at');
    expect(columnKeys).toContain('chat_messages.conversation_id');
    expect(columnKeys).toContain('chat_messages.content');
    expect(columnKeys).toContain('chat_messages.citations');
    expect(columnKeys).toContain('chat_messages.generation_status');
    expect(columnKeys).toContain('chat_messages.generation_error');

    const { rows: indexes } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('chat_conversations', 'chat_messages')
      `,
    );

    const indexNames = indexes.map(row => row.indexname);
    expect(indexNames).toContain('chat_conversations_vault_created_idx');
    expect(indexNames).toContain('chat_conversations_created_by_vault_idx');
    expect(indexNames).toContain('chat_messages_conversation_created_idx');
    expect(indexNames).toContain('chat_messages_vault_created_idx');
  });

  test('0016 adds chat scopes for global and document conversations', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: columns } = await pool.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }>(
      `
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('chat_conversations', 'chat_messages')
          AND column_name IN ('vault_id', 'scope', 'document_id')
      `,
    );

    const byKey = Object.fromEntries(
      columns.map(row => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['chat_conversations.vault_id']?.is_nullable).toBe('YES');
    expect(byKey['chat_messages.vault_id']?.is_nullable).toBe('YES');
    expect(byKey['chat_conversations.scope']?.is_nullable).toBe('NO');
    expect(byKey['chat_messages.scope']?.is_nullable).toBe('NO');
    expect(byKey['chat_conversations.document_id']?.is_nullable).toBe('YES');
    expect(byKey['chat_messages.document_id']?.is_nullable).toBe('YES');
  });

  test('document_chunks.embedding remains a 768-dim pgvector column', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{ format_type: string }>(
      `
        SELECT format_type(a.atttypid, a.atttypmod) AS format_type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'document_chunks'
          AND a.attname = 'embedding'
          AND a.attnum > 0
          AND NOT a.attisdropped
      `,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.format_type).toBe('vector(768)');
  });

  test('0014 creates the background_jobs table used by async workers', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'background_jobs'
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.id?.data_type).toBe('text');
    expect(byName.queue_name?.data_type).toBe('text');
    expect(byName.name?.data_type).toBe('text');
    expect(byName.payload?.data_type).toBe('jsonb');
    expect(byName.status?.column_default).toContain("'pending'");
    expect(byName.progress?.column_default).toContain('0');
    expect(byName.attempts?.column_default).toContain('0');
    expect(byName.max_attempts?.column_default).toContain('1');
    expect(byName.run_at?.column_default).toContain('now()');

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'background_jobs'
      `,
    );

    expect(indexRows.map(row => row.indexname)).toEqual(
      expect.arrayContaining([
        'background_jobs_queue_status_run_idx',
        'background_jobs_status_run_idx',
        'background_jobs_locked_at_idx',
      ]),
    );
  });
});

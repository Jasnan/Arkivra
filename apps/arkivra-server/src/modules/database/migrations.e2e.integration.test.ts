import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Resolve the drizzle migrations folder relative to this file so the
// test works whether vitest is invoked from the monorepo root or from
// inside apps/arkivra-server.
const drizzleFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');

// Spins up an isolated Postgres database, runs the generated baseline in
// apps/arkivra-server/drizzle, and asserts that important columns, tables,
// constraints, and indexes exist with the expected types and defaults.
// Existing columns and indexes are re-checked so accidental drops fail loudly.

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
    isolatedDatabaseUrl = new URL(baseDatabaseUrl)
      .toString()
      .replace(/\/[^/?]+(\?.*)?$/, `/${isolatedDatabaseName}$1`);

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

  test('baseline includes citation-grade provenance columns on document_chunks', async () => {
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
            'citation_precision',
            'section_path'
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
    expect(byName.section_path?.data_type).toBe('jsonb');

    expect(byName.parent_element_id?.data_type).toBe('text');
    expect(byName.original_text?.data_type).toBe('text');

    expect(byName.citation_precision?.data_type).toBe('text');
    expect(byName.citation_precision?.is_nullable).toBe('NO');
    expect(byName.citation_precision?.column_default).toContain("'document'");
  });

  test('baseline includes the document_chunks_page_idx index', async () => {
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

  test('baseline includes the document_chunk_assets table with the expected shape', async () => {
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
    expect(byName.source_element_id?.data_type).toBe('text');
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

  test('baseline wires document_chunk_assets foreign keys with ON DELETE CASCADE', async () => {
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

    const hasForeignKey = ({
      columnName,
      deleteRule,
      foreignTableName,
    }: {
      columnName: string;
      deleteRule: string;
      foreignTableName: string;
    }) =>
      rows.some(
        (row) =>
          row.column_name === columnName &&
          row.foreign_table_name === foreignTableName &&
          row.delete_rule === deleteRule,
      );

    expect(
      hasForeignKey({
        columnName: 'chunk_id',
        deleteRule: 'CASCADE',
        foreignTableName: 'document_chunks',
      }),
    ).toBe(true);
    expect(
      hasForeignKey({
        columnName: 'document_id',
        deleteRule: 'CASCADE',
        foreignTableName: 'documents',
      }),
    ).toBe(true);
    expect(
      hasForeignKey({
        columnName: 'vault_id',
        deleteRule: 'CASCADE',
        foreignTableName: 'vaults',
      }),
    ).toBe(true);
  });

  test('ingestion AI settings default to disabled', async () => {
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
            'ollama_translation_model',
            'embedding_provider',
            'embedding_base_url',
            'embedding_api_key_secret_ref',
            'embedding_model',
            'embedding_dimensions',
            'ollama_embedding_enabled',
            'ollama_embedding_model',
            'ollama_embedding_dimensions'
          )
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.ollama_translation_model?.data_type).toBe('text');
    expect(byName.ollama_translation_model?.column_default).toContain("''");

    expect(byName.embedding_provider?.data_type).toBe('text');
    expect(byName.embedding_provider?.is_nullable).toBe('YES');
    expect(byName.embedding_base_url?.data_type).toBe('text');
    expect(byName.embedding_base_url?.is_nullable).toBe('YES');
    expect(byName.embedding_api_key_secret_ref?.data_type).toBe('text');
    expect(byName.embedding_api_key_secret_ref?.is_nullable).toBe('YES');
    expect(byName.embedding_model?.data_type).toBe('text');
    expect(byName.embedding_model?.is_nullable).toBe('YES');
    expect(byName.embedding_dimensions?.data_type).toBe('integer');
    expect(byName.embedding_dimensions?.is_nullable).toBe('YES');

    expect(byName.ollama_embedding_enabled?.data_type).toBe('boolean');
    expect(byName.ollama_embedding_enabled?.column_default).toContain('false');

    expect(byName.ollama_embedding_model?.data_type).toBe('text');
    expect(byName.ollama_embedding_model?.is_nullable).toBe('YES');
    expect(byName.ollama_embedding_model?.column_default).toBeNull();

    expect(byName.ollama_embedding_dimensions?.data_type).toBe('integer');
    expect(byName.ollama_embedding_dimensions?.is_nullable).toBe('YES');
    expect(byName.ollama_embedding_dimensions?.column_default).toBeNull();
  });

  test('baseline keeps parser artifacts on documents and document_versions', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: versionRows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_versions'
          AND column_name IN (
            'raw_text',
            'raw_markdown',
            'parser_structured_output',
            'processing_status',
            'file_encryption_key_wrapped',
            'file_encryption_kek_version'
          )
      `,
    );

    const byName = Object.fromEntries(versionRows.map((row) => [row.column_name, row]));

    expect(byName.raw_text?.data_type).toBe('text');
    expect(byName.raw_text?.is_nullable).toBe('NO');
    expect(byName.raw_text?.column_default).toContain("''");

    expect(byName.raw_markdown?.data_type).toBe('text');
    expect(byName.raw_markdown?.is_nullable).toBe('NO');
    expect(byName.raw_markdown?.column_default).toContain("''");

    expect(byName.parser_structured_output?.data_type).toBe('jsonb');
    expect(byName.parser_structured_output?.is_nullable).toBe('YES');

    expect(byName.processing_status?.data_type).toBe('text');
    expect(byName.processing_status?.is_nullable).toBe('NO');
    expect(byName.processing_status?.column_default).toContain("'pending'");

    expect(byName.file_encryption_key_wrapped?.data_type).toBe('text');
    expect(byName.file_encryption_key_wrapped?.is_nullable).toBe('YES');

    expect(byName.file_encryption_kek_version?.data_type).toBe('text');
    expect(byName.file_encryption_kek_version?.is_nullable).toBe('YES');

    const { rows: documentRows } = await pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'documents'
          AND column_name IN (
            'raw_text',
            'raw_markdown',
            'parser_structured_output',
            'processing_status',
            'file_encryption_key_wrapped',
            'file_encryption_kek_version'
          )
      `,
    );

    expect(documentRows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'raw_text',
        'raw_markdown',
        'parser_structured_output',
        'processing_status',
        'file_encryption_key_wrapped',
        'file_encryption_kek_version',
      ]),
    );
  });

  test('baseline includes chunk section lineage and durable asset source element ids', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: chunkRows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_chunks'
          AND column_name IN ('section_path')
      `,
    );

    const chunkByName = Object.fromEntries(chunkRows.map((row) => [row.column_name, row]));
    expect(chunkByName.section_path?.data_type).toBe('jsonb');
    expect(chunkByName.section_path?.is_nullable).toBe('YES');

    const { rows: assetRows } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_chunk_assets'
          AND column_name IN ('source_element_id')
      `,
    );

    const assetByName = Object.fromEntries(assetRows.map((row) => [row.column_name, row]));
    expect(assetByName.source_element_id?.data_type).toBe('text');
    expect(assetByName.source_element_id?.is_nullable).toBe('YES');
  });

  test('baseline includes encryption metadata columns on document_chunk_assets', async () => {
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

  test('baseline creates chat conversation and message tables', async () => {
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

    const columnKeys = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));

    expect(columnKeys).toContain('chat_conversations.vault_id');
    expect(columnKeys).toContain('chat_conversations.user_id');
    expect(columnKeys).toContain('chat_conversations.title');
    expect(columnKeys).toContain('chat_conversations.deleted_at');
    expect(columnKeys).toContain('chat_messages.conversation_id');
    expect(columnKeys).toContain('chat_messages.message');
    expect(columnKeys).not.toContain('chat_messages.content');
    expect(columnKeys).not.toContain('chat_messages.citations');
    expect(columnKeys).not.toContain('chat_messages.generation_status');
    expect(columnKeys).not.toContain('chat_messages.generation_error');

    const { rows: indexes } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('chat_conversations', 'chat_messages')
      `,
    );

    const indexNames = indexes.map((row) => row.indexname);
    expect(indexNames).toContain('chat_conversations_vault_created_idx');
    expect(indexNames).toContain('chat_conversations_user_id_vault_idx');
    expect(indexNames).toContain('chat_messages_conversation_created_idx');
    expect(indexNames).toContain('chat_messages_vault_created_idx');
  });

  test('baseline includes chat scopes for global and document conversations', async () => {
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
      columns.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['chat_conversations.vault_id']?.is_nullable).toBe('YES');
    expect(byKey['chat_messages.vault_id']?.is_nullable).toBe('YES');
    expect(byKey['chat_conversations.scope']?.is_nullable).toBe('NO');
    expect(byKey['chat_messages.scope']?.is_nullable).toBe('NO');
    expect(byKey['chat_conversations.document_id']?.is_nullable).toBe('YES');
    expect(byKey['chat_messages.document_id']?.is_nullable).toBe('YES');
  });

  test('baseline includes immutable context snapshots on chat conversations', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_conversations'
          AND column_name = 'context_snapshot'
      `,
    );

    expect(rows[0]?.data_type).toBe('jsonb');
    expect(rows[0]?.is_nullable).toBe('NO');
  });

  test('baseline stores vectors outside document_chunks and includes embedding index tables', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: oldEmbeddingColumns } = await pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_chunks'
          AND column_name = 'embedding'
      `,
    );

    expect(oldEmbeddingColumns).toHaveLength(0);

    const { rows: tableRows } = await pool.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'ai_provider_configs',
            'embedding_indexes',
            'document_chunk_embeddings',
            'document_embedding_index_status'
          )
      `,
    );

    expect(new Set(tableRows.map((row) => row.table_name))).toEqual(
      new Set([
        'ai_provider_configs',
        'embedding_indexes',
        'document_chunk_embeddings',
        'document_embedding_index_status',
      ]),
    );

    const { rows: embeddingColumnRows } = await pool.query<{ format_type: string }>(
      `
        SELECT format_type(a.atttypid, a.atttypmod) AS format_type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'document_chunk_embeddings'
          AND a.attname = 'embedding'
          AND a.attnum > 0
          AND NOT a.attisdropped
      `,
    );

    expect(embeddingColumnRows).toHaveLength(1);
    expect(embeddingColumnRows[0]?.format_type).toBe('vector');

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'embedding_indexes_single_active_idx',
            'document_chunk_embeddings_index_doc_idx',
            'document_chunk_embeddings_index_vault_idx',
            'document_embedding_index_status_pkey'
          )
      `,
    );

    expect(new Set(indexRows.map((row) => row.indexname))).toEqual(
      new Set([
        'embedding_indexes_single_active_idx',
        'document_chunk_embeddings_index_doc_idx',
        'document_chunk_embeddings_index_vault_idx',
        'document_embedding_index_status_pkey',
      ]),
    );
  });

  test('baseline includes document_versions and current version ownership columns', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: columns } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            table_name = 'document_versions'
            OR (table_name = 'documents' AND column_name = 'current_version_id')
          )
      `,
    );

    const byKey = Object.fromEntries(
      columns.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['documents.current_version_id']?.data_type).toBe('text');
    expect(byKey['documents.current_version_id']?.is_nullable).toBe('YES');

    expect(byKey['document_versions.id']?.data_type).toBe('text');
    expect(byKey['document_versions.document_id']?.is_nullable).toBe('NO');
    expect(byKey['document_versions.vault_id']?.is_nullable).toBe('NO');
    expect(byKey['document_versions.version_number']?.data_type).toBe('integer');
    expect(byKey['document_versions.version_number']?.is_nullable).toBe('NO');
    expect(byKey['document_versions.uploaded_at']?.column_default).toContain('now()');
    expect(byKey['document_versions.original_storage_key']?.is_nullable).toBe('NO');
    expect(byKey['document_versions.original_sha256_hash']?.is_nullable).toBe('NO');
    expect(byKey['document_versions.mime_type']?.is_nullable).toBe('NO');
    expect(byKey['document_versions.processing_status']?.column_default).toContain("'pending'");

    const { rows: indexes } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('documents', 'document_versions')
      `,
    );

    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'documents_id_vault_unique',
        'documents_current_version_idx',
        'document_versions_document_number_unique',
        'document_versions_id_document_vault_unique',
        'document_versions_vault_document_number_idx',
        'document_versions_vault_status_uploaded_idx',
        'document_versions_vault_hash_idx',
        'document_versions_kek_version_idx',
      ]),
    );
  });

  test('baseline wires version-owned chunks, assets, embeddings, and upload sessions', async () => {
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
          AND (
            (table_name = 'document_chunks'
              AND column_name IN ('document_version_id', 'content_sha256', 'tsv'))
            OR (table_name = 'document_chunk_assets' AND column_name = 'document_version_id')
            OR (table_name = 'document_chunk_embeddings'
              AND column_name IN ('document_version_id', 'embedding'))
            OR (table_name = 'document_embedding_index_status'
              AND column_name = 'document_version_id')
            OR (table_name = 'upload_sessions' AND column_name = 'document_version_id')
          )
      `,
    );

    const byKey = Object.fromEntries(
      columns.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['document_chunks.document_version_id']?.is_nullable).toBe('NO');
    expect(byKey['document_chunks.content_sha256']?.data_type).toBe('text');
    expect(byKey['document_chunks.tsv']?.data_type).toBe('tsvector');
    expect(byKey['document_chunk_assets.document_version_id']?.is_nullable).toBe('NO');
    expect(byKey['document_chunk_embeddings.document_version_id']?.is_nullable).toBe('NO');
    expect(byKey['document_chunk_embeddings.embedding']?.data_type).toBe('USER-DEFINED');
    expect(byKey['document_embedding_index_status.document_version_id']?.is_nullable).toBe('NO');
    expect(byKey['upload_sessions.document_version_id']?.is_nullable).toBe('YES');

    const { rows: indexes } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (
            'document_chunks',
            'document_chunk_assets',
            'document_chunk_embeddings',
            'document_embedding_index_status',
            'upload_sessions'
          )
      `,
    );

    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'document_chunks_version_index_unique',
        'document_chunks_vault_version_idx',
        'document_chunks_version_page_idx',
        'document_chunk_assets_vault_version_idx',
        'document_chunk_embeddings_index_version_idx',
        'document_chunk_embeddings_index_doc_version_idx',
        'document_embedding_index_status_pkey',
        'document_embedding_index_status_doc_version_idx',
        'upload_sessions_document_version_idx',
      ]),
    );

    const { rows: primaryKeyRows } = await pool.query<{ column_name: string }>(
      `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
          AND kcu.constraint_name = tc.constraint_name
          AND kcu.table_name = tc.table_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'document_embedding_index_status'
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
      `,
    );

    expect(primaryKeyRows.map((row) => row.column_name)).toEqual([
      'embedding_index_id',
      'document_version_id',
    ]);
  });

  test('baseline includes frozen chat manifests and purge-tolerant citation references', async () => {
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
          AND (
            (table_name = 'chat_conversations' AND column_name = 'context_frozen_at')
            OR table_name IN ('chat_conversation_document_versions', 'chat_message_citations')
          )
      `,
    );

    const byKey = Object.fromEntries(
      columns.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['chat_conversations.context_frozen_at']?.data_type).toBe(
      'timestamp with time zone',
    );
    expect(byKey['chat_conversation_document_versions.conversation_id']?.is_nullable).toBe('NO');
    expect(byKey['chat_conversation_document_versions.vault_id']?.is_nullable).toBe('NO');
    expect(byKey['chat_conversation_document_versions.document_id']?.is_nullable).toBe('NO');
    expect(byKey['chat_conversation_document_versions.document_version_id']?.is_nullable).toBe(
      'YES',
    );
    expect(byKey['chat_message_citations.version_number']?.data_type).toBe('integer');
    expect(byKey['chat_message_citations.page_start']?.data_type).toBe('integer');
    expect(byKey['chat_message_citations.locator_json']?.data_type).toBe('jsonb');

    const { rows: foreignKeys } = await pool.query<{
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      delete_rule: string;
    }>(
      `
        SELECT
          tc.table_name,
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
          AND tc.table_name IN (
            'chat_conversations',
            'chat_messages',
            'chat_conversation_document_versions',
            'chat_message_citations'
          )
      `,
    );

    const hasForeignKey = ({
      columnName,
      deleteRule,
      foreignTableName,
      tableName,
    }: {
      columnName: string;
      deleteRule: string;
      foreignTableName: string;
      tableName: string;
    }) =>
      foreignKeys.some(
        (row) =>
          row.table_name === tableName &&
          row.column_name === columnName &&
          row.foreign_table_name === foreignTableName &&
          row.delete_rule === deleteRule,
      );

    expect(
      hasForeignKey({
        columnName: 'document_id',
        deleteRule: 'SET NULL',
        foreignTableName: 'documents',
        tableName: 'chat_conversations',
      }),
    ).toBe(true);
    expect(
      hasForeignKey({
        columnName: 'document_id',
        deleteRule: 'SET NULL',
        foreignTableName: 'documents',
        tableName: 'chat_messages',
      }),
    ).toBe(true);
    expect(
      hasForeignKey({
        columnName: 'document_version_id',
        deleteRule: 'SET NULL',
        foreignTableName: 'document_versions',
        tableName: 'chat_conversation_document_versions',
      }),
    ).toBe(true);
    expect(
      hasForeignKey({
        columnName: 'document_version_id',
        deleteRule: 'NO ACTION',
        foreignTableName: 'document_versions',
        tableName: 'chat_conversation_document_versions',
      }),
    ).toBe(false);
    expect(
      hasForeignKey({
        columnName: 'document_version_id',
        deleteRule: 'SET NULL',
        foreignTableName: 'document_versions',
        tableName: 'chat_message_citations',
      }),
    ).toBe(true);
    expect(
      hasForeignKey({
        columnName: 'document_version_id',
        deleteRule: 'NO ACTION',
        foreignTableName: 'document_versions',
        tableName: 'chat_message_citations',
      }),
    ).toBe(false);
    expect(
      hasForeignKey({
        columnName: 'chunk_id',
        deleteRule: 'SET NULL',
        foreignTableName: 'document_chunks',
        tableName: 'chat_message_citations',
      }),
    ).toBe(true);
  });

  test('baseline includes version-owned document element provenance', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: columns } = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_element_provenance'
      `,
    );

    const byName = Object.fromEntries(columns.map((row) => [row.column_name, row]));

    expect(byName.document_id?.data_type).toBe('text');
    expect(byName.document_version_id?.is_nullable).toBe('NO');
    expect(byName.vault_id?.is_nullable).toBe('NO');
    expect(byName.element_id?.is_nullable).toBe('NO');
    expect(byName.element_type?.data_type).toBe('text');
    expect(byName.text?.data_type).toBe('text');
    expect(byName.page_number?.data_type).toBe('integer');
    expect(byName.bbox?.data_type).toBe('jsonb');
    expect(byName.section_path?.data_type).toBe('jsonb');
    expect(byName.sort_index?.is_nullable).toBe('NO');

    const { rows: primaryKeyRows } = await pool.query<{ column_name: string }>(
      `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
          AND kcu.constraint_name = tc.constraint_name
          AND kcu.table_name = tc.table_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'document_element_provenance'
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
      `,
    );

    expect(primaryKeyRows.map((row) => row.column_name)).toEqual([
      'document_version_id',
      'element_id',
    ]);

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'document_element_provenance'
      `,
    );

    expect(indexRows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'document_element_provenance_pk',
        'document_element_provenance_version_sort_idx',
        'document_element_provenance_version_page_idx',
      ]),
    );
  });

  test('baseline creates the background_jobs table used by async workers', async () => {
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
    expect(byName.run_at?.data_type).toBe('timestamp with time zone');
    expect(byName.run_at?.column_default).toContain('now()');

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'background_jobs'
      `,
    );

    expect(indexRows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'background_jobs_queue_status_run_idx',
        'background_jobs_status_run_idx',
        'background_jobs_locked_at_idx',
      ]),
    );
  });

  test('all timestamp columns are timezone-aware instants', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
        ORDER BY table_name, column_name
      `,
    );

    const timezoneLessColumns = rows.filter(
      row => row.data_type === 'timestamp without time zone',
    );

    expect(timezoneLessColumns).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.data_type === 'timestamp with time zone')).toBe(true);
  });

  test('baseline creates vault folders and folder references', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            table_name = 'vault_folders'
            OR (table_name = 'documents' AND column_name = 'folder_id')
            OR (table_name = 'upload_sessions' AND column_name IN ('folder_id', 'relative_path'))
          )
      `,
    );

    const byKey = Object.fromEntries(
      rows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['vault_folders.id']?.data_type).toBe('text');
    expect(byKey['vault_folders.vault_id']?.is_nullable).toBe('NO');
    expect(byKey['vault_folders.parent_id']?.is_nullable).toBe('YES');
    expect(byKey['vault_folders.name']?.is_nullable).toBe('NO');
    expect(byKey['vault_folders.is_deleted']?.is_nullable).toBe('NO');
    expect(byKey['documents.folder_id']?.data_type).toBe('text');
    expect(byKey['upload_sessions.folder_id']?.data_type).toBe('text');
    expect(byKey['upload_sessions.relative_path']?.data_type).toBe('text');

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('vault_folders', 'documents', 'upload_sessions')
      `,
    );

    expect(indexRows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'vault_folders_active_sibling_name_unique',
        'vault_folders_vault_parent_deleted_name_idx',
        'documents_vault_folder_deleted_created_idx',
        'upload_sessions_folder_idx',
      ]),
    );
  });

  test('baseline keeps active logical filename uniqueness and version hash indexing', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: documentIndexRows } = await pool.query<{ indexname: string; indexdef: string }>(
      `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'documents'
      `,
    );

    const documentIndexes = Object.fromEntries(
      documentIndexRows.map((row) => [row.indexname, row.indexdef]),
    );

    expect(documentIndexes.documents_active_folder_filename_unique).toContain('lower');
    expect(documentIndexes.documents_active_folder_filename_unique).toContain('original_name');
    expect(documentIndexes.documents_vault_hash_unique).toBeUndefined();

    const { rows: versionIndexRows } = await pool.query<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'document_versions'
      `,
    );

    const versionIndexNames = versionIndexRows.map((row) => row.indexname);
    expect(versionIndexNames).toEqual(
      expect.arrayContaining([
        'document_versions_document_number_unique',
        'document_versions_vault_document_number_idx',
        'document_versions_vault_hash_idx',
      ]),
    );
  });

  test('baseline stores UI appearance preferences as a single JSON column', async () => {
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
          AND table_name = 'user_ui_preferences'
          AND column_name IN (
            'appearance_preferences',
            'accent_color',
            'date_format',
            'default_chat_answer_mode',
            'default_file_browser_view',
            'density',
            'font_family',
            'font_size',
            'language',
            'radius',
            'show_extracted_text_tab',
            'theme_mode',
            'timezone'
          )
      `,
    );

    const byName = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(byName.appearance_preferences?.data_type).toBe('jsonb');
    expect(byName.appearance_preferences?.is_nullable).toBe('NO');
    expect(byName.appearance_preferences?.column_default).toContain('themeMode');

    expect(byName.accent_color).toBeUndefined();
    expect(byName.date_format).toBeUndefined();
    expect(byName.default_chat_answer_mode).toBeUndefined();
    expect(byName.default_file_browser_view).toBeUndefined();
    expect(byName.density).toBeUndefined();
    expect(byName.font_family).toBeUndefined();
    expect(byName.font_size).toBeUndefined();
    expect(byName.language).toBeUndefined();
    expect(byName.radius).toBeUndefined();
    expect(byName.show_extracted_text_tab).toBeUndefined();
    expect(byName.theme_mode).toBeUndefined();
    expect(byName.timezone).toBeUndefined();
  });

  test('baseline includes platform privileges and vault role schema', async () => {
    if (pool === null) {
      throw new Error('Migration smoke pool not initialised');
    }

    const { rows: columnRows } = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'users' AND column_name = 'system_role')
            OR (table_name = 'vaults' AND column_name = 'created_by')
            OR (table_name = 'vault_members' AND column_name = 'role')
            OR table_name IN ('system_capabilities', 'permission_requests', 'email_invitations')
          )
      `,
    );

    const byKey = Object.fromEntries(
      columnRows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
    );

    expect(byKey['users.system_role']?.data_type).toBe('text');
    expect(byKey['users.system_role']?.is_nullable).toBe('NO');
    expect(byKey['users.system_role']?.column_default).toContain("'member'");

    expect(byKey['vaults.created_by']?.data_type).toBe('text');

    expect(byKey['system_capabilities.user_id']?.is_nullable).toBe('NO');
    expect(byKey['system_capabilities.capability']?.is_nullable).toBe('NO');
    expect(byKey['permission_requests.type']?.is_nullable).toBe('NO');
    expect(byKey['permission_requests.status']?.column_default).toContain("'pending'");
    expect(byKey['email_invitations.type']?.is_nullable).toBe('NO');

    const { rows: tableRows } = await pool.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'user_global_roles',
            'vault_member_permissions',
            'system_capabilities',
            'permission_requests',
            'email_invitations'
          )
      `,
    );

    const tableNames = tableRows.map((row) => row.table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining(['system_capabilities', 'permission_requests', 'email_invitations']),
    );
    expect(tableNames).not.toContain('user_global_roles');
    expect(tableNames).not.toContain('vault_member_permissions');
  });
});

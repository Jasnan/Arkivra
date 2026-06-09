import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isTable } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from '../modules/database/schema/index.js';

const drizzleFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

const rawSqlManagedColumns = new Set([
  'document_chunk_embeddings.embedding',
  'document_chunks.tsv',
]);

const rawSqlManagedForeignKeys = new Set([
  [
    'documents(current_version_id,id,vault_id)',
    'document_versions(id,document_id,vault_id)',
    'delete:no action',
    'update:no action',
  ].join(' -> '),
  [
    'document_versions(document_id,vault_id)',
    'documents(id,vault_id)',
    'delete:cascade',
    'update:no action',
  ].join(' -> '),
]);

const columnTypeByDrizzleType: Record<string, string> = {
  PgBoolean: 'boolean',
  PgInteger: 'integer',
  PgJsonb: 'jsonb',
  PgText: 'text',
  PgTimestamp: 'timestamp without time zone',
};

type SchemaColumn = {
  hasDatabaseDefault: boolean;
  isPrimaryKey: boolean;
  name: string;
  nullable: boolean;
  type: string;
};

type SchemaTable = {
  columns: Map<string, SchemaColumn>;
  foreignKeys: Set<string>;
  indexes: Set<string>;
  name: string;
  primaryKeyColumns: Set<string>;
};

type DatabaseColumn = {
  column_default: string | null;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  table_name: string;
};

type PrimaryKeyColumn = {
  column_name: string;
  table_name: string;
};

type ForeignKeyRow = {
  column_names: string[];
  delete_rule: string;
  foreign_column_names: string[];
  foreign_table_name: string;
  table_name: string;
  update_rule: string;
};

function databaseNameFromUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, '');
}

function databaseUrlForName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function adminUrlFromDatabaseUrl(databaseUrl: string): string {
  return databaseUrlForName(databaseUrl, 'postgres');
}

function collectSchemaTables(): Map<string, SchemaTable> {
  const tables = new Map<string, SchemaTable>();

  for (const value of Object.values(schema)) {
    if (!isTable(value)) {
      continue;
    }

    const tableConfig = getTableConfig(value);
    const primaryKeyColumns = new Set<string>();

    for (const column of tableConfig.columns) {
      if (column.primary) {
        primaryKeyColumns.add(column.name);
      }
    }

    for (const primaryKey of tableConfig.primaryKeys) {
      for (const column of primaryKey.columns) {
        primaryKeyColumns.add(column.name);
      }
    }

    const columns = new Map<string, SchemaColumn>();
    for (const column of tableConfig.columns) {
      const type = columnTypeByDrizzleType[column.columnType];
      if (type === undefined) {
        throw new Error(
          `Unsupported Drizzle column type ${column.columnType} on ${tableConfig.name}.${column.name}`,
        );
      }

      columns.set(column.name, {
        hasDatabaseDefault: column.default !== undefined,
        isPrimaryKey: primaryKeyColumns.has(column.name),
        name: column.name,
        nullable: !column.notNull && !primaryKeyColumns.has(column.name),
        type,
      });
    }

    const indexes = new Set<string>();
    for (const index of tableConfig.indexes) {
      if (index.config.name !== undefined) {
        indexes.add(index.config.name);
      }
    }

    for (const uniqueConstraint of tableConfig.uniqueConstraints) {
      if (uniqueConstraint.name !== undefined) {
        indexes.add(uniqueConstraint.name);
      }
    }

    const foreignKeys = new Set<string>();
    for (const foreignKey of tableConfig.foreignKeys) {
      const reference = foreignKey.reference();
      const foreignTableName = getTableConfig(reference.foreignTable).name;
      foreignKeys.add(
        formatForeignKey({
          columnNames: reference.columns.map((column) => column.name),
          foreignColumnNames: reference.foreignColumns.map((column) => column.name),
          foreignTableName,
          onDelete: foreignKey.onDelete,
          onUpdate: foreignKey.onUpdate,
          tableName: tableConfig.name,
        }),
      );
    }

    tables.set(tableConfig.name, {
      columns,
      foreignKeys,
      indexes,
      name: tableConfig.name,
      primaryKeyColumns,
    });
  }

  return tables;
}

function sortedValues<T>(values: Iterable<T>): T[] {
  return [...values].sort();
}

function formatColumn(tableName: string, columnName: string): string {
  return `${tableName}.${columnName}`;
}

function formatForeignKey({
  columnNames,
  foreignColumnNames,
  foreignTableName,
  onDelete,
  onUpdate,
  tableName,
}: {
  columnNames: string[];
  foreignColumnNames: string[];
  foreignTableName: string;
  onDelete: string | undefined;
  onUpdate: string | undefined;
  tableName: string;
}): string {
  return [
    `${tableName}(${columnNames.join(',')})`,
    `${foreignTableName}(${foreignColumnNames.join(',')})`,
    `delete:${normaliseReferentialAction(onDelete)}`,
    `update:${normaliseReferentialAction(onUpdate)}`,
  ].join(' -> ');
}

function normaliseReferentialAction(action: string | undefined): string {
  return (action ?? 'no action').toLowerCase().replace(/\s+/g, ' ');
}

async function migrateIsolatedDatabase(baseDatabaseUrl: string): Promise<{
  adminPool: Pool;
  databaseName: string;
  databaseUrl: string;
}> {
  const configuredDatabaseName = databaseNameFromUrl(baseDatabaseUrl);
  if (configuredDatabaseName.length === 0) {
    throw new Error('ARKIVRA_DATABASE_URL must include a database name');
  }

  const databaseName = `arkivra_schema_drift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const databaseUrl = databaseUrlForName(baseDatabaseUrl, databaseName);
  const adminPool = new Pool({ connectionString: adminUrlFromDatabaseUrl(baseDatabaseUrl) });
  let databaseCreated = false;

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;

    const migrationPool = new Pool({ connectionString: databaseUrl });
    const migrationDb = drizzle(migrationPool);
    try {
      await migrate(migrationDb, { migrationsFolder: drizzleFolder });
    } finally {
      await migrationPool.end();
    }

    return { adminPool, databaseName, databaseUrl };
  } catch (error) {
    if (databaseCreated) {
      await dropIsolatedDatabase(adminPool, databaseName);
    }
    await adminPool.end();
    throw error;
  }
}

async function dropIsolatedDatabase(adminPool: Pool, databaseName: string): Promise<void> {
  if (!databaseName.startsWith('arkivra_schema_drift_')) {
    throw new Error(`Refusing to drop unexpected database name: ${databaseName}`);
  }

  await adminPool.query(
    `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()
    `,
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
}

async function readDatabaseCatalog(databaseUrl: string): Promise<{
  columnsByTable: Map<string, Map<string, DatabaseColumn>>;
  foreignKeysByTable: Map<string, Set<string>>;
  indexesByTable: Map<string, Set<string>>;
  primaryKeyColumnsByTable: Map<string, Set<string>>;
  tables: Set<string>;
}> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const { rows: tableRows } = await pool.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
    );

    const { rows: columnRows } = await pool.query<DatabaseColumn>(
      `
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `,
    );

    const { rows: indexRows } = await pool.query<{ indexname: string; tablename: string }>(
      `
        SELECT tablename, indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `,
    );

    const { rows: primaryKeyRows } = await pool.query<PrimaryKeyColumn>(
      `
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
          AND kcu.constraint_name = tc.constraint_name
          AND kcu.table_name = tc.table_name
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.table_name, kcu.ordinal_position
      `,
    );

    const { rows: foreignKeyRows } = await pool.query<ForeignKeyRow>(
      `
        SELECT
          source_table.relname AS table_name,
          target_table.relname AS foreign_table_name,
          CASE constraint_row.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END AS delete_rule,
          CASE constraint_row.confupdtype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END AS update_rule,
          array_agg(source_column.attname::text ORDER BY source_key.ordinality) AS column_names,
          array_agg(target_column.attname::text ORDER BY source_key.ordinality) AS foreign_column_names
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS source_table
          ON source_table.oid = constraint_row.conrelid
        JOIN pg_namespace AS source_namespace
          ON source_namespace.oid = source_table.relnamespace
        JOIN pg_class AS target_table
          ON target_table.oid = constraint_row.confrelid
        JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS source_key(attnum, ordinality)
          ON true
        JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS target_key(attnum, ordinality)
          ON target_key.ordinality = source_key.ordinality
        JOIN pg_attribute AS source_column
          ON source_column.attrelid = constraint_row.conrelid
          AND source_column.attnum = source_key.attnum
        JOIN pg_attribute AS target_column
          ON target_column.attrelid = constraint_row.confrelid
          AND target_column.attnum = target_key.attnum
        WHERE source_namespace.nspname = 'public'
          AND constraint_row.contype = 'f'
        GROUP BY
          constraint_row.oid,
          source_table.relname,
          target_table.relname,
          constraint_row.confdeltype,
          constraint_row.confupdtype
        ORDER BY source_table.relname, constraint_row.conname
      `,
    );

    const tables = new Set(tableRows.map((row) => row.table_name));
    const columnsByTable = new Map<string, Map<string, DatabaseColumn>>();
    const foreignKeysByTable = new Map<string, Set<string>>();
    const indexesByTable = new Map<string, Set<string>>();
    const primaryKeyColumnsByTable = new Map<string, Set<string>>();

    for (const column of columnRows) {
      if (!columnsByTable.has(column.table_name)) {
        columnsByTable.set(column.table_name, new Map());
      }
      columnsByTable.get(column.table_name)?.set(column.column_name, column);
    }

    for (const index of indexRows) {
      if (!indexesByTable.has(index.tablename)) {
        indexesByTable.set(index.tablename, new Set());
      }
      indexesByTable.get(index.tablename)?.add(index.indexname);
    }

    for (const primaryKey of primaryKeyRows) {
      if (!primaryKeyColumnsByTable.has(primaryKey.table_name)) {
        primaryKeyColumnsByTable.set(primaryKey.table_name, new Set());
      }
      primaryKeyColumnsByTable.get(primaryKey.table_name)?.add(primaryKey.column_name);
    }

    for (const foreignKey of foreignKeyRows) {
      if (!foreignKeysByTable.has(foreignKey.table_name)) {
        foreignKeysByTable.set(foreignKey.table_name, new Set());
      }

      foreignKeysByTable.get(foreignKey.table_name)?.add(
        formatForeignKey({
          columnNames: foreignKey.column_names,
          foreignColumnNames: foreignKey.foreign_column_names,
          foreignTableName: foreignKey.foreign_table_name,
          onDelete: foreignKey.delete_rule,
          onUpdate: foreignKey.update_rule,
          tableName: foreignKey.table_name,
        }),
      );
    }

    return {
      columnsByTable,
      foreignKeysByTable,
      indexesByTable,
      primaryKeyColumnsByTable,
      tables,
    };
  } finally {
    await pool.end();
  }
}

function compareCatalogs(
  schemaTables: Map<string, SchemaTable>,
  databaseCatalog: Awaited<ReturnType<typeof readDatabaseCatalog>>,
): string[] {
  const issues: string[] = [];
  const schemaTableNames = new Set(schemaTables.keys());

  for (const tableName of sortedValues(schemaTableNames)) {
    if (!databaseCatalog.tables.has(tableName)) {
      issues.push(`Missing migrated table: ${tableName}`);
    }
  }

  for (const tableName of sortedValues(databaseCatalog.tables)) {
    if (!schemaTableNames.has(tableName)) {
      issues.push(`Migrated table is not present in Drizzle schema: ${tableName}`);
    }
  }

  for (const table of sortedValues(schemaTables.values()).filter((candidate) =>
    databaseCatalog.tables.has(candidate.name),
  )) {
    const databaseColumns = databaseCatalog.columnsByTable.get(table.name) ?? new Map();

    for (const column of sortedValues(table.columns.values())) {
      const databaseColumn = databaseColumns.get(column.name);
      if (databaseColumn === undefined) {
        issues.push(`Missing migrated column: ${formatColumn(table.name, column.name)}`);
        continue;
      }

      if (databaseColumn.data_type !== column.type) {
        issues.push(
          `Column type drift: ${formatColumn(table.name, column.name)} is ${databaseColumn.data_type}, expected ${column.type}`,
        );
      }

      const databaseNullable = databaseColumn.is_nullable === 'YES';
      if (databaseNullable !== column.nullable) {
        issues.push(
          `Column nullability drift: ${formatColumn(table.name, column.name)} is ${
            databaseNullable ? 'nullable' : 'not nullable'
          }, expected ${column.nullable ? 'nullable' : 'not nullable'}`,
        );
      }

      const databaseHasDefault = databaseColumn.column_default !== null;
      if (databaseHasDefault !== column.hasDatabaseDefault) {
        issues.push(
          `Column default drift: ${formatColumn(table.name, column.name)} ${
            databaseHasDefault ? 'has' : 'does not have'
          } a database default, expected ${column.hasDatabaseDefault ? 'a database default' : 'no database default'}`,
        );
      }
    }

    for (const databaseColumn of sortedValues(databaseColumns.values())) {
      const qualifiedColumn = formatColumn(table.name, databaseColumn.column_name);
      if (
        !table.columns.has(databaseColumn.column_name) &&
        !rawSqlManagedColumns.has(qualifiedColumn)
      ) {
        issues.push(`Migrated column is not present in Drizzle schema: ${qualifiedColumn}`);
      }
    }

    const databasePrimaryKeyColumns =
      databaseCatalog.primaryKeyColumnsByTable.get(table.name) ?? new Set();
    for (const columnName of sortedValues(table.primaryKeyColumns)) {
      if (!databasePrimaryKeyColumns.has(columnName)) {
        issues.push(`Missing migrated primary key column: ${formatColumn(table.name, columnName)}`);
      }
    }

    for (const columnName of sortedValues(databasePrimaryKeyColumns)) {
      if (!table.primaryKeyColumns.has(columnName)) {
        issues.push(
          `Migrated primary key column is not present in Drizzle schema: ${formatColumn(table.name, columnName)}`,
        );
      }
    }

    const databaseForeignKeys = databaseCatalog.foreignKeysByTable.get(table.name) ?? new Set();
    for (const foreignKey of sortedValues(table.foreignKeys)) {
      if (!databaseForeignKeys.has(foreignKey)) {
        issues.push(`Missing migrated foreign key: ${foreignKey}`);
      }
    }

    for (const foreignKey of sortedValues(databaseForeignKeys)) {
      if (!table.foreignKeys.has(foreignKey) && !rawSqlManagedForeignKeys.has(foreignKey)) {
        issues.push(`Migrated foreign key is not present in Drizzle schema: ${foreignKey}`);
      }
    }

    const databaseIndexes = databaseCatalog.indexesByTable.get(table.name) ?? new Set();
    for (const indexName of sortedValues(table.indexes)) {
      if (!databaseIndexes.has(indexName)) {
        issues.push(`Missing migrated index or unique constraint: ${table.name}.${indexName}`);
      }
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const baseDatabaseUrl =
    process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra';
  let isolatedDatabase: Awaited<ReturnType<typeof migrateIsolatedDatabase>> | null = null;

  try {
    isolatedDatabase = await migrateIsolatedDatabase(baseDatabaseUrl);
    const schemaTables = collectSchemaTables();
    const databaseCatalog = await readDatabaseCatalog(isolatedDatabase.databaseUrl);
    const issues = compareCatalogs(schemaTables, databaseCatalog);

    if (issues.length > 0) {
      console.error('Drizzle schema and generated migrations are out of sync:');
      for (const issue of issues) {
        console.error(`- ${issue}`);
      }
      process.exitCode = 1;
      return;
    }

    console.info('Drizzle schema matches generated migrations.');
  } finally {
    if (isolatedDatabase !== null) {
      try {
        await dropIsolatedDatabase(isolatedDatabase.adminPool, isolatedDatabase.databaseName);
      } finally {
        await isolatedDatabase.adminPool.end();
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

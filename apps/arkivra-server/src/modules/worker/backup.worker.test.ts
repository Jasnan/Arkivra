import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { createBackupArchive, restoreBackupArchive } from './backup.worker.js';

describe('backup worker helpers', () => {
  const backupEncryptionKeyRaw = 'a'.repeat(64);
  let backupDirectory = '';
  let storageBasePath = '';
  let extractedStorageKey = '';

  beforeAll(async () => {
    backupDirectory = await mkdtemp(join(tmpdir(), 'arkivra-backup-worker-'));
    storageBasePath = await mkdtemp(join(tmpdir(), 'arkivra-backup-storage-'));
    extractedStorageKey = 'vlt_1/doc_1';

    await mkdir(join(storageBasePath, 'vlt_1'), { recursive: true });
    await writeFile(join(storageBasePath, extractedStorageKey), Buffer.from('encrypted-file'));
  });

  afterAll(async () => {
    await rm(backupDirectory, { recursive: true, force: true });
    await rm(storageBasePath, { recursive: true, force: true });
  });

  test('creates a backup archive with metadata and database sql', async () => {
    const pool = {
      query: vi.fn(async (queryText: string, params?: unknown[]) => {
        if (queryText.includes('information_schema.columns') && params?.[0] === 'users') {
          return {
            rows: [
              { column_name: 'id' },
              { column_name: 'created_at' },
              { column_name: 'updated_at' },
              { column_name: 'email' },
              { column_name: 'email_verified' },
              { column_name: 'name' },
              { column_name: 'image' },
              { column_name: 'two_factor_enabled' },
            ],
          };
        }

        if (queryText.includes('SELECT "id", "created_at", "updated_at", "email"')) {
          return {
            rows: [
              {
                id: 'usr_1',
                created_at: new Date('2025-01-01T00:00:00.000Z'),
                updated_at: new Date('2025-01-01T00:00:00.000Z'),
                email: 'backup@example.com',
                email_verified: false,
                name: null,
                image: null,
                two_factor_enabled: false,
              },
            ],
          };
        }

        return { rows: [] };
      }),
    } as never;

    const result = await createBackupArchive({
      backupDirectory,
      backupEncryptionKeyRaw,
      backupPartSizeBytes: 512 * 1024 * 1024,
      maintenanceFlagPath: join(backupDirectory, '.maintenance-mode.test'),
      pool,
      storageBasePath,
      version: 'test',
    });

    expect(result.backupId).toContain('arkivra-backup-');
    expect(result.backupId).toContain('.manifest.json');
    const archiveBytes = await readFile(result.filePath);
    expect(archiveBytes.length).toBeGreaterThan(0);
  });

  test('restores backup archive contents', async () => {
    const maintenanceFlagPath = join(backupDirectory, '.maintenance-mode.test');
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ storage_key: extractedStorageKey }] }),
    } as never;

    const createPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never;

    const backup = await createBackupArchive({
      backupDirectory,
      backupEncryptionKeyRaw,
      backupPartSizeBytes: 512 * 1024 * 1024,
      maintenanceFlagPath,
      pool: createPool,
      storageBasePath,
      version: 'test',
    });

    await rm(storageBasePath, { recursive: true, force: true });
    await mkdir(storageBasePath, { recursive: true });

    const result = await restoreBackupArchive({
      backupDirectory,
      backupEncryptionKeyRaw,
      backupId: backup.backupId,
      maintenanceFlagPath,
      pool,
      storageBasePath,
    });

    expect(result).toEqual({
      backupId: backup.backupId,
      restored: true,
    });

    const restoredFile = await readFile(join(storageBasePath, extractedStorageKey), 'utf8');
    expect(restoredFile).toBe('encrypted-file');
  });

  test('fails backup before publishing when referenced storage is missing', async () => {
    const isolatedBackupDirectory = await mkdtemp(join(tmpdir(), 'arkivra-backup-missing-file-'));
    const isolatedStoragePath = await mkdtemp(join(tmpdir(), 'arkivra-backup-missing-storage-'));
    const maintenanceFlagPath = join(isolatedBackupDirectory, '.maintenance-mode.test');
    const pool = {
      query: vi.fn(async (queryText: string) => {
        if (queryText.includes('COUNT(*)::int AS count')) {
          return { rows: [{ count: 0 }] };
        }

        if (queryText.includes('original_storage_key AS storage_key')) {
          return { rows: [{ storage_key: 'missing/source.bin' }] };
        }

        return { rows: [] };
      }),
    } as never;

    try {
      await expect(createBackupArchive({
        backupDirectory: isolatedBackupDirectory,
        backupEncryptionKeyRaw,
        backupPartSizeBytes: 512 * 1024 * 1024,
        maintenanceFlagPath,
        pool,
        storageBasePath: isolatedStoragePath,
        version: 'test',
      })).rejects.toThrow();

      const entries = await readdir(isolatedBackupDirectory);
      expect(entries.some(entry => entry.endsWith('.manifest.json'))).toBe(false);
      expect(entries).not.toContain('.maintenance-mode.test');
    }
    finally {
      await rm(isolatedBackupDirectory, { recursive: true, force: true });
      await rm(isolatedStoragePath, { recursive: true, force: true });
    }
  });
});

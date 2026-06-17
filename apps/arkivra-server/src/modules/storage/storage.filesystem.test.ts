import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { createFilesystemStorage } from './storage.filesystem.js';

async function createTempStorage() {
  const parentPath = await mkdtemp(join(tmpdir(), 'arkivra-storage-test-'));
  const basePath = join(parentPath, 'storage');
  const storage = createFilesystemStorage({ basePath });

  return {
    basePath,
    parentPath,
    storage,
    async cleanup() {
      await rm(parentPath, { recursive: true, force: true });
    },
  };
}

describe('createFilesystemStorage', () => {
  test('writes and reads nested storage keys under the configured base path', async () => {
    const { basePath, cleanup, storage } = await createTempStorage();

    try {
      await storage.write('vault_1/doc_1/source.bin', Buffer.from('document-data'));

      await expect(storage.exists('vault_1/doc_1/source.bin')).resolves.toBe(true);
      await expect(storage.read('vault_1/doc_1/source.bin')).resolves.toEqual(
        Buffer.from('document-data'),
      );
      await expect(readFile(join(basePath, 'vault_1/doc_1/source.bin'), 'utf8')).resolves.toBe(
        'document-data',
      );
    } finally {
      await cleanup();
    }
  });

  test('rejects traversal, absolute, empty, and platform-separator keys', async () => {
    const { parentPath, cleanup, storage } = await createTempStorage();

    try {
      await expect(storage.write('../escaped.bin', Buffer.from('x'))).rejects.toThrow(
        'Invalid storage key',
      );
      await expect(storage.write('/tmp/escaped.bin', Buffer.from('x'))).rejects.toThrow(
        'Invalid storage key',
      );
      await expect(storage.write('', Buffer.from('x'))).rejects.toThrow('Invalid storage key');
      await expect(storage.write('vault_1\\doc_1', Buffer.from('x'))).rejects.toThrow(
        'Invalid storage key',
      );
      await expect(access(join(parentPath, 'escaped.bin'))).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });
});

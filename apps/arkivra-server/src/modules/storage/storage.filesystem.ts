import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageDriver } from './storage.types.js';

export function createFilesystemStorage({ basePath }: { basePath: string }): StorageDriver {
  function resolvePath(key: string): string {
    return join(basePath, key);
  }

  return {
    async write(key, data) {
      const filePath = resolvePath(key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
    },

    async read(key) {
      const filePath = resolvePath(key);
      return readFile(filePath);
    },

    async remove(key) {
      const filePath = resolvePath(key);
      await rm(filePath, { force: true });
    },

    async removePrefix(prefix) {
      const prefixPath = resolvePath(prefix);
      await rm(prefixPath, { recursive: true, force: true });
    },

    async exists(key) {
      const filePath = resolvePath(key);

      try {
        await stat(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

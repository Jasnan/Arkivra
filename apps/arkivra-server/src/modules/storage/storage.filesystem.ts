import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { StorageDriver } from './storage.types.js';

export function createFilesystemStorage({ basePath }: { basePath: string }): StorageDriver {
  const rootPath = resolve(basePath);

  function resolvePath(key: string): string {
    const segments = key.split('/');
    if (
      key.length === 0 ||
      key.includes('\\') ||
      isAbsolute(key) ||
      segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    ) {
      throw new Error('Invalid storage key');
    }

    const filePath = resolve(rootPath, key);
    const relativePath = relative(rootPath, filePath);
    if (relativePath.length === 0 || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Invalid storage key');
    }

    return filePath;
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

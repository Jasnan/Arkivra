import type { Config } from '../config/config.js';
import type { StorageDriver } from './storage.types.js';
import { createFilesystemStorage } from './storage.filesystem.js';

export function createStorageDriver({ config }: { config: Config }): StorageDriver {
  if (config.storage.driver === 'filesystem') {
    return createFilesystemStorage({ basePath: config.storage.filesystem.basePath });
  }

  throw new Error(`Unsupported storage driver: ${config.storage.driver}`);
}

import { access, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Config } from '../../config/config.js';
import type { BackupListItem } from './backups.types.js';

function backupFileNamePattern(fileName: string) {
  return fileName.endsWith('.tar.gz') && fileName.startsWith('arkivra-backup-');
}

export function createBackupServices({ config }: { config: Config }) {
  const backupDirectory = resolve(config.backups.directory);
  const maintenanceFlagPath = join(backupDirectory, config.backups.maintenanceFlagFile);

  async function ensureBackupDirectory() {
    await mkdir(backupDirectory, { recursive: true });
  }

  async function listBackups(): Promise<BackupListItem[]> {
    await ensureBackupDirectory();

    const entries = await readdir(backupDirectory, { withFileTypes: true });
    const backupFiles = entries
      .filter(entry => entry.isFile() && backupFileNamePattern(entry.name))
      .map(entry => entry.name);

    const backups = await Promise.all(
      backupFiles.map(async (fileName) => {
        const filePath = join(backupDirectory, fileName);
        const fileStats = await stat(filePath);

        return {
          id: fileName,
          fileName,
          size: fileStats.size,
          createdAt: fileStats.mtime.toISOString(),
        };
      }),
    );

    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function resolveBackupPath({ backupId }: { backupId: string }) {
    if (!backupFileNamePattern(backupId) || backupId.includes('/') || backupId.includes('\\')) {
      return null;
    }

    return join(backupDirectory, backupId);
  }

  async function backupExists({ backupId }: { backupId: string }) {
    const filePath = resolveBackupPath({ backupId });

    if (filePath === null) {
      return false;
    }

    try {
      await access(filePath, constants.F_OK);
      return true;
    }
    catch {
      return false;
    }
  }

  async function readBackupFile({ backupId }: { backupId: string }) {
    const filePath = resolveBackupPath({ backupId });

    if (filePath === null) {
      return null;
    }

    try {
      const file = await readFile(filePath);
      return {
        file,
        fileName: backupId,
      };
    }
    catch {
      return null;
    }
  }

  async function isMaintenanceModeEnabled() {
    try {
      await access(maintenanceFlagPath, constants.F_OK);
      return true;
    }
    catch {
      return false;
    }
  }

  return {
    backupDirectory,
    backupExists,
    ensureBackupDirectory,
    isMaintenanceModeEnabled,
    listBackups,
    maintenanceFlagPath,
    readBackupFile,
    resolveBackupPath,
  };
}

export type BackupServices = ReturnType<typeof createBackupServices>;

import { constants, createWriteStream } from 'node:fs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../../config/config.js';
import type { BackupListItem } from './backups.types.js';
import {
  BACKUP_ARCHIVE_ALGORITHM,
  BACKUP_ARCHIVE_KEY_DERIVATION,
  BACKUP_MANIFEST_VERSION,
  MAX_BACKUP_PART_SIZE_BYTES,
  MIN_BACKUP_PART_SIZE_BYTES,
} from '../../worker/backup.archive.js';
import type {
  BackupArchiveManifest,
  BackupArchivePartManifest,
} from '../../worker/backup.archive.js';

function legacyBackupFileNamePattern(fileName: string) {
  return fileName.endsWith('.tar.gz') && fileName.startsWith('arkivra-backup-');
}

function manifestFileNamePattern(fileName: string) {
  return fileName.endsWith('.manifest.json') && fileName.startsWith('arkivra-backup-');
}

function backupFileNamePattern(fileName: string) {
  return legacyBackupFileNamePattern(fileName) || manifestFileNamePattern(fileName);
}

function partFileNamePattern(fileName: string, backupId: string) {
  const baseId = backupId.replace(/\.manifest\.json$/, '');
  return fileName.startsWith(`${baseId}.part`) && /^\d+$/.test(fileName.slice(`${baseId}.part`.length));
}

function isSafeFileName(fileName: string) {
  return !fileName.includes('/') && !fileName.includes('\\') && fileName.length > 0;
}

function isSafeBackupBaseId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.startsWith('arkivra-backup-') &&
    !id.endsWith('.manifest.json') &&
    isSafeFileName(id)
  );
}

function decodeBase64(value: unknown, expectedBytes: number) {
  if (typeof value !== 'string') {
    return false;
  }

  const decoded = Buffer.from(value, 'base64');
  return decoded.length === expectedBytes && decoded.toString('base64').replaceAll('=', '') === value.replaceAll('=', '');
}

function isValidSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{64}$/i.test(value);
}

function expectedPartFileName({ backupId, index }: { backupId: string; index: number }) {
  return `${backupId}.part${String(index).padStart(3, '0')}`;
}

function validateManifestPart({
  backupId,
  part,
  expectedIndex,
}: {
  backupId: string;
  part: BackupArchivePartManifest;
  expectedIndex: number;
}) {
  return (
    Number.isSafeInteger(part.index) &&
    part.index === expectedIndex &&
    part.fileName === expectedPartFileName({ backupId, index: expectedIndex }) &&
    Number.isSafeInteger(part.size) &&
    part.size > 0 &&
    isValidSha256(part.sha256)
  );
}

function validateBackupArchiveManifest(manifest: BackupArchiveManifest) {
  if (
    !isSafeBackupBaseId(manifest.id) ||
    manifest.formatVersion !== BACKUP_MANIFEST_VERSION ||
    manifest.archive?.encrypted !== true ||
    manifest.archive.algorithm !== BACKUP_ARCHIVE_ALGORITHM ||
    manifest.archive.keyDerivation !== BACKUP_ARCHIVE_KEY_DERIVATION ||
    !decodeBase64(manifest.archive.salt, 16) ||
    !decodeBase64(manifest.archive.iv, 12) ||
    !decodeBase64(manifest.archive.authTag, 16) ||
    !Number.isSafeInteger(manifest.archive.partSizeBytes) ||
    manifest.archive.partSizeBytes < MIN_BACKUP_PART_SIZE_BYTES ||
    manifest.archive.partSizeBytes > MAX_BACKUP_PART_SIZE_BYTES ||
    !Number.isSafeInteger(manifest.archive.totalEncryptedSize) ||
    manifest.archive.totalEncryptedSize <= 0 ||
    !Array.isArray(manifest.archive.parts) ||
    manifest.archive.parts.length === 0
  ) {
    return false;
  }

  let totalSize = 0;
  for (const [index, part] of manifest.archive.parts.entries()) {
    if (!validateManifestPart({ backupId: manifest.id, part, expectedIndex: index + 1 })) {
      return false;
    }
    totalSize += part.size;
  }

  return totalSize === manifest.archive.totalEncryptedSize;
}

async function readImportedManifest({
  backupDirectory,
  backupId,
}: {
  backupDirectory: string;
  backupId: string;
}) {
  const filePath = join(backupDirectory, backupId);
  const manifest = JSON.parse(await readFile(filePath, 'utf8')) as BackupArchiveManifest;
  return validateBackupArchiveManifest(manifest) ? manifest : null;
}

async function readImportedManifestSafely({
  backupDirectory,
  backupId,
}: {
  backupDirectory: string;
  backupId: string;
}) {
  try {
    return await readImportedManifest({ backupDirectory, backupId });
  }
  catch {
    return null;
  }
}

async function verifyAndWritePart({
  body,
  destinationPath,
  expectedPart,
  temporaryPath,
}: {
  body: ReadableStream<Uint8Array>;
  destinationPath: string;
  expectedPart: BackupArchivePartManifest;
  temporaryPath: string;
}) {
  const hash = createHash('sha256');
  let size = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body),
      verifier,
      createWriteStream(temporaryPath, { flags: 'wx' }),
    );

    const actualHash = hash.digest();
    const expectedHash = Buffer.from(expectedPart.sha256, 'hex');
    const matches =
      size === expectedPart.size &&
      actualHash.length === expectedHash.length &&
      timingSafeEqual(actualHash, expectedHash);

    if (!matches) {
      return false;
    }

    await rename(temporaryPath, destinationPath);
    return true;
  }
  finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export function createBackupServices({ config }: { config: Config }) {
  const backupDirectory = resolve(config.backups.directory);
  const maintenanceFlagPath = join(backupDirectory, config.backups.maintenanceFlagFile);

  async function ensureBackupDirectory() {
    await mkdir(backupDirectory, { recursive: true });
  }

  async function getMultipartBackupState(backupId: string) {
    const manifest = await readImportedManifestSafely({ backupDirectory, backupId });

    if (manifest === null) {
      return {
        partCount: 0,
        size: 0,
        restorable: false,
        corruptReason: 'backup.invalid_manifest',
      };
    }

    for (const part of manifest.archive.parts) {
      try {
        const partStats = await stat(join(backupDirectory, part.fileName));
        if (partStats.size !== part.size) {
          return {
            partCount: manifest.archive.parts.length,
            size: manifest.archive.totalEncryptedSize,
            restorable: false,
            corruptReason: 'backup.part_size_mismatch',
          };
        }
      }
      catch {
        return {
          partCount: manifest.archive.parts.length,
          size: manifest.archive.totalEncryptedSize,
          restorable: false,
          corruptReason: 'backup.incomplete_parts',
        };
      }
    }

    return {
      partCount: manifest.archive.parts.length,
      size: manifest.archive.totalEncryptedSize,
      restorable: true,
      corruptReason: null,
    };
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
        const format: BackupListItem['format'] = manifestFileNamePattern(fileName) ? 'encrypted_multipart' : 'legacy_tar_gz';
        let size = fileStats.size;
        let partCount = 1;
        let restorable = true;
        let corruptReason: string | null = null;

        if (format === 'encrypted_multipart') {
          const state = await getMultipartBackupState(fileName);
          size = state.size;
          partCount = state.partCount;
          restorable = state.restorable;
          corruptReason = state.corruptReason;
        }

        return {
          id: fileName,
          fileName,
          format,
          partCount,
          restorable,
          corruptReason,
          size,
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

  async function backupIsRestorable({ backupId }: { backupId: string }) {
    if (!manifestFileNamePattern(backupId)) {
      return backupExists({ backupId });
    }

    const filePath = resolveBackupPath({ backupId });
    if (filePath === null) {
      return false;
    }

    try {
      await access(filePath, constants.F_OK);
      const state = await getMultipartBackupState(backupId);
      return state.restorable;
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

  function resolveBackupPartPath({
    backupId,
    partFileName,
  }: {
    backupId: string;
    partFileName: string;
  }) {
    if (!manifestFileNamePattern(backupId) || !isSafeFileName(partFileName) || !partFileNamePattern(partFileName, backupId)) {
      return null;
    }

    return join(backupDirectory, partFileName);
  }

  async function writeImportedManifest({ manifest }: { manifest: BackupArchiveManifest }) {
    if (!validateBackupArchiveManifest(manifest)) {
      return { ok: false as const, reason: 'invalid' as const };
    }

    await ensureBackupDirectory();
    const manifestFileName = `${manifest.id}.manifest.json`;
    try {
      await writeFile(join(backupDirectory, manifestFileName), JSON.stringify(manifest, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return { ok: false as const, reason: 'already_exists' as const };
      }
      throw error;
    }

    return {
      ok: true as const,
      backupId: manifestFileName,
      partCount: manifest.archive.parts.length,
    };
  }

  async function writeImportedPart({
    backupId,
    body,
    partFileName,
  }: {
    backupId: string;
    body: ReadableStream<Uint8Array> | null;
    partFileName: string;
  }) {
    if (body === null || !manifestFileNamePattern(backupId) || !isSafeFileName(partFileName) || !partFileNamePattern(partFileName, backupId)) {
      return { ok: false as const, reason: 'invalid' as const };
    }

    await ensureBackupDirectory();
    const manifest = await readImportedManifestSafely({ backupDirectory, backupId });
    const expectedPart = manifest?.archive.parts.find(part => part.fileName === partFileName);

    if (manifest === null) {
      return { ok: false as const, reason: 'manifest_not_found' as const };
    }

    if (expectedPart === undefined) {
      return { ok: false as const, reason: 'unknown_part' as const };
    }

    const destinationPath = join(backupDirectory, partFileName);
    try {
      await access(destinationPath, constants.F_OK);
      return { ok: false as const, reason: 'already_exists' as const };
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const temporaryPath = join(backupDirectory, `${partFileName}.${randomUUID()}.uploading`);
    const written = await verifyAndWritePart({
      body,
      destinationPath,
      expectedPart,
      temporaryPath,
    });

    if (!written) {
      return { ok: false as const, reason: 'checksum_mismatch' as const };
    }

    return { ok: true as const };
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
    backupIsRestorable,
    ensureBackupDirectory,
    isMaintenanceModeEnabled,
    listBackups,
    maintenanceFlagPath,
    readBackupFile,
    resolveBackupPartPath,
    resolveBackupPath,
    writeImportedManifest,
    writeImportedPart,
  };
}

export type BackupServices = ReturnType<typeof createBackupServices>;

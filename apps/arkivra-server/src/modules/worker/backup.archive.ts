import { createDecipheriv, createHash, createCipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

export const BACKUP_MANIFEST_VERSION = 2;
export const BACKUP_ARCHIVE_ALGORITHM = 'aes-256-gcm';
export const BACKUP_ARCHIVE_KEY_DERIVATION = 'hkdf-sha256';
export const BACKUP_ARCHIVE_KEY_INFO = 'arkivra-backup-archive-v1';
export const DEFAULT_BACKUP_PART_SIZE_BYTES = 16 * 1024 * 1024 * 1024;
export const MIN_BACKUP_PART_SIZE_BYTES = 512 * 1024 * 1024;
export const MAX_BACKUP_PART_SIZE_BYTES = 64 * 1024 * 1024 * 1024;

export type BackupArchivePartManifest = {
  index: number;
  fileName: string;
  size: number;
  sha256: string;
};

export type BackupArchiveManifest = {
  id: string;
  arkivraVersion: string;
  createdAt: string;
  formatVersion: number;
  archive: {
    encrypted: true;
    algorithm: typeof BACKUP_ARCHIVE_ALGORITHM;
    keyDerivation: typeof BACKUP_ARCHIVE_KEY_DERIVATION;
    salt: string;
    iv: string;
    authTag: string;
    partSizeBytes: number;
    totalEncryptedSize: number;
    parts: BackupArchivePartManifest[];
  };
};

export type EncryptedArchiveResult = {
  manifest: BackupArchiveManifest;
  manifestFileName: string;
};

export function normalizeBackupEncryptionKey(raw: string | undefined): Buffer | null {
  if (raw === undefined || raw.trim().length === 0) {
    return null;
  }

  const value = raw.trim();
  if (/^[\da-f]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error('ARKIVRA_BACKUP_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.');
}

export function normalizeBackupPartSizeBytes(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError('Backup part size must be an integer.');
  }

  if (value < MIN_BACKUP_PART_SIZE_BYTES || value > MAX_BACKUP_PART_SIZE_BYTES) {
    throw new Error(
      `Backup part size must be between ${MIN_BACKUP_PART_SIZE_BYTES} and ${MAX_BACKUP_PART_SIZE_BYTES} bytes.`,
    );
  }

  return value;
}

function deriveArchiveKey({ rootKey, salt }: { rootKey: Buffer; salt: Buffer }) {
  return Buffer.from(hkdfSync('sha256', rootKey, salt, BACKUP_ARCHIVE_KEY_INFO, 32));
}

function waitForProcess(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

class SplitPartWriter extends Writable {
  private currentStream: ReturnType<typeof createWriteStream> | null = null;
  private currentHash = createHash('sha256');
  private currentSize = 0;
  private partIndex = 0;
  private totalSize = 0;
  readonly parts: BackupArchivePartManifest[] = [];

  constructor(
    private readonly destinationDirectory: string,
    private readonly backupId: string,
    private readonly partSizeBytes: number,
  ) {
    super();
  }

  private async openNextPart() {
    this.partIndex += 1;
    this.currentSize = 0;
    this.currentHash = createHash('sha256');
    const fileName = `${this.backupId}.part${String(this.partIndex).padStart(3, '0')}`;
    this.currentStream = createWriteStream(join(this.destinationDirectory, fileName));
  }

  private async closeCurrentPart() {
    if (this.currentStream === null) {
      return;
    }

    const stream = this.currentStream;
    this.currentStream = null;
    await new Promise<void>((resolve, reject) => {
      stream.once('error', reject);
      stream.end(resolve);
    });

    this.parts.push({
      index: this.partIndex,
      fileName: `${this.backupId}.part${String(this.partIndex).padStart(3, '0')}`,
      size: this.currentSize,
      sha256: this.currentHash.digest('hex'),
    });
  }

  override async _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      let offset = 0;

      while (offset < chunk.length) {
        if (this.currentStream === null) {
          await this.openNextPart();
        }

        const remainingInPart = this.partSizeBytes - this.currentSize;
        const slice = chunk.subarray(offset, offset + remainingInPart);

        await new Promise<void>((resolve, reject) => {
          this.currentStream!.write(slice, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        this.currentHash.update(slice);
        this.currentSize += slice.length;
        this.totalSize += slice.length;
        offset += slice.length;

        if (this.currentSize >= this.partSizeBytes) {
          await this.closeCurrentPart();
        }
      }

      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override async _final(callback: (error?: Error | null) => void) {
    try {
      await this.closeCurrentPart();
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getTotalSize() {
    return this.totalSize;
  }
}

function createPartsReadable({
  manifest,
  backupDirectory,
}: {
  manifest: BackupArchiveManifest;
  backupDirectory: string;
}) {
  async function* readParts() {
    for (const part of manifest.archive.parts) {
      yield* createReadStream(join(backupDirectory, part.fileName));
    }
  }

  return Readable.from(readParts());
}

export async function createEncryptedBackupArchive({
  backupDirectory,
  backupId,
  createdAt,
  encryptionKey,
  partSizeBytes,
  sourceDirectory,
  version,
}: {
  backupDirectory: string;
  backupId: string;
  createdAt: Date;
  encryptionKey: Buffer;
  partSizeBytes: number;
  sourceDirectory: string;
  version: string;
}): Promise<EncryptedArchiveResult> {
  await mkdir(backupDirectory, { recursive: true });

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const archiveKey = deriveArchiveKey({ rootKey: encryptionKey, salt });
  const cipher = createCipheriv(BACKUP_ARCHIVE_ALGORITHM, archiveKey, iv);
  const partWriter = new SplitPartWriter(backupDirectory, backupId, partSizeBytes);
  const tar = spawn('tar', ['-czhf', '-', '-C', sourceDirectory, '.'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  await Promise.all([
    pipeline(tar.stdout, cipher, partWriter),
    waitForProcess(tar),
  ]);

  const manifest: BackupArchiveManifest = {
    id: backupId,
    arkivraVersion: version,
    createdAt: createdAt.toISOString(),
    formatVersion: BACKUP_MANIFEST_VERSION,
    archive: {
      encrypted: true,
      algorithm: BACKUP_ARCHIVE_ALGORITHM,
      keyDerivation: BACKUP_ARCHIVE_KEY_DERIVATION,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      partSizeBytes,
      totalEncryptedSize: partWriter.getTotalSize(),
      parts: partWriter.parts,
    },
  };
  const manifestFileName = `${backupId}.manifest.json`;

  await writeFile(join(backupDirectory, manifestFileName), JSON.stringify(manifest, null, 2), 'utf8');

  return {
    manifest,
    manifestFileName,
  };
}

export async function readBackupManifest({
  backupDirectory,
  manifestFileName,
}: {
  backupDirectory: string;
  manifestFileName: string;
}) {
  const manifest = JSON.parse(
    await readFile(join(backupDirectory, manifestFileName), 'utf8'),
  ) as BackupArchiveManifest;

  if (manifest.formatVersion !== BACKUP_MANIFEST_VERSION) {
    throw new Error(`Unsupported backup manifest version: ${manifest.formatVersion}`);
  }

  if (manifest.archive.encrypted !== true || manifest.archive.algorithm !== BACKUP_ARCHIVE_ALGORITHM) {
    throw new Error('Unsupported backup archive encryption format.');
  }

  return manifest;
}

export async function verifyBackupParts({
  backupDirectory,
  manifest,
}: {
  backupDirectory: string;
  manifest: BackupArchiveManifest;
}) {
  for (const part of manifest.archive.parts) {
    if (basename(part.fileName) !== part.fileName) {
      throw new Error(`Invalid backup part filename: ${part.fileName}`);
    }

    const partPath = join(backupDirectory, part.fileName);
    const partStats = await stat(partPath);
    if (partStats.size !== part.size) {
      throw new Error(`Backup part size mismatch: ${part.fileName}`);
    }

    const hash = createHash('sha256');
    await pipeline(createReadStream(partPath), hash);
    const actualHash = hash.digest();
    const expectedHash = Buffer.from(part.sha256, 'hex');

    if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
      throw new Error(`Backup part checksum mismatch: ${part.fileName}`);
    }
  }
}

export async function extractEncryptedBackupArchive({
  backupDirectory,
  destinationPath,
  encryptionKey,
  manifest,
}: {
  backupDirectory: string;
  destinationPath: string;
  encryptionKey: Buffer;
  manifest: BackupArchiveManifest;
}) {
  await verifyBackupParts({ backupDirectory, manifest });

  const salt = Buffer.from(manifest.archive.salt, 'base64');
  const iv = Buffer.from(manifest.archive.iv, 'base64');
  const archiveKey = deriveArchiveKey({ rootKey: encryptionKey, salt });
  const decipher = createDecipheriv(BACKUP_ARCHIVE_ALGORITHM, archiveKey, iv);
  decipher.setAuthTag(Buffer.from(manifest.archive.authTag, 'base64'));

  const tar = spawn('tar', ['-xzf', '-', '-C', destinationPath], {
    stdio: ['pipe', 'ignore', 'inherit'],
  });

  await Promise.all([
    pipeline(createPartsReadable({ manifest, backupDirectory }), decipher, tar.stdin),
    waitForProcess(tar),
  ]);
}

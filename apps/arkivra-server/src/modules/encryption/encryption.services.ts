import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DEK_LENGTH = 32;

export type KekEntry = {
  version: string;
  key: Buffer;
};

export type EncryptionResult = {
  encryptedData: Buffer;
  wrappedDek: string;
  kekVersion: string;
  algorithm: string;
};

export type EncryptionServices = ReturnType<typeof createEncryptionServices>;

export function parseKekKeys(raw: string | undefined): KekEntry[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const colonIndex = entry.indexOf(':');

      if (colonIndex === -1) {
        throw new Error(`Invalid KEK entry format: expected "version:hex-key", got "${entry}"`);
      }

      const version = entry.slice(0, colonIndex);
      const hexKey = entry.slice(colonIndex + 1);

      if (version.length === 0) {
        throw new Error('KEK version cannot be empty');
      }

      if (hexKey.length !== 64) {
        throw new Error(
          `KEK key must be 32 bytes (64 hex chars), version "${version}" has ${hexKey.length} chars`,
        );
      }

      return {
        version,
        key: Buffer.from(hexKey, 'hex'),
      };
    });
}

export function getActiveKek(keks: KekEntry[]): KekEntry {
  if (keks.length === 0) {
    throw new Error('No KEK keys configured. Set ARKIVRA_ENCRYPTION_KEYS env var.');
  }

  // Highest version number encrypts new files
  return keks.reduce((a, b) => {
    const aNum = Number.parseInt(a.version, 10);
    const bNum = Number.parseInt(b.version, 10);
    return bNum > aNum ? b : a;
  });
}

export function findKekByVersion(keks: KekEntry[], version: string): KekEntry {
  const kek = keks.find((k) => k.version === version);

  if (kek === undefined) {
    throw new Error(
      `KEK version "${version}" not found. Cannot decrypt. Available versions: ${keks.map((k) => k.version).join(', ')}`,
    );
  }

  return kek;
}

export function getActiveKekFromRaw(kekKeysRaw: string | undefined): KekEntry {
  return getActiveKek(parseKekKeys(kekKeysRaw));
}

export function findKekByVersionFromRaw({
  kekKeysRaw,
  version,
}: {
  kekKeysRaw: string | undefined;
  version: string;
}): KekEntry {
  return findKekByVersion(parseKekKeys(kekKeysRaw), version);
}

function generateDek(): Buffer {
  return randomBytes(DEK_LENGTH);
}

function encryptWithKey(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv (12) + authTag (16) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptWithKey(encryptedData: Buffer, key: Buffer): Buffer {
  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function wrapDek(dek: Buffer, kek: Buffer): string {
  const wrapped = encryptWithKey(dek, kek);
  return wrapped.toString('base64');
}

function unwrapDek(wrappedDek: string, kek: Buffer): Buffer {
  const wrapped = Buffer.from(wrappedDek, 'base64');
  return decryptWithKey(wrapped, kek);
}

export function createEncryptionServices({ kekKeysRaw }: { kekKeysRaw: string | undefined }) {
  const keks = parseKekKeys(kekKeysRaw);

  function isEnabled(): boolean {
    return keks.length > 0;
  }

  function encrypt(plaintext: Buffer): EncryptionResult {
    const activeKek = getActiveKek(keks);
    const dek = generateDek();

    const encryptedData = encryptWithKey(plaintext, dek);
    const wrapped = wrapDek(dek, activeKek.key);

    return {
      encryptedData,
      wrappedDek: wrapped,
      kekVersion: activeKek.version,
      algorithm: ALGORITHM,
    };
  }

  function decrypt({
    encryptedData,
    wrappedDek: wrappedDekStr,
    kekVersion,
  }: {
    encryptedData: Buffer;
    wrappedDek: string;
    kekVersion: string;
  }): Buffer {
    const kek = findKekByVersion(keks, kekVersion);
    const dek = unwrapDek(wrappedDekStr, kek.key);

    return decryptWithKey(encryptedData, dek);
  }

  return {
    decrypt,
    encrypt,
    isEnabled,
  };
}

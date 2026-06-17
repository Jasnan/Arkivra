import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { createEncryptionServices, parseKekKeys } from './encryption.services.js';

function generateHexKey(): string {
  return randomBytes(32).toString('hex');
}

describe('parseKekKeys', () => {
  test('returns empty array for undefined input', () => {
    expect(parseKekKeys(undefined)).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(parseKekKeys('')).toEqual([]);
  });

  test('parses single key entry', () => {
    const hex = generateHexKey();
    const result = parseKekKeys(`1:${hex}`);
    expect(result).toHaveLength(1);
    expect(result[0]!.version).toBe('1');
    expect(result[0]!.key.toString('hex')).toBe(hex);
  });

  test('parses multiple key entries', () => {
    const hex1 = generateHexKey();
    const hex2 = generateHexKey();
    const result = parseKekKeys(`1:${hex1},2:${hex2}`);
    expect(result).toHaveLength(2);
    expect(result[0]!.version).toBe('1');
    expect(result[1]!.version).toBe('2');
  });

  test('throws for invalid format without colon', () => {
    expect(() => parseKekKeys('invalidentry')).toThrow('Invalid KEK entry format');
  });

  test('throws for wrong key length', () => {
    expect(() => parseKekKeys('1:abcdef')).toThrow('KEK key must be 32 bytes');
  });

  test('throws for empty version', () => {
    const hex = generateHexKey();
    expect(() => parseKekKeys(`:${hex}`)).toThrow('KEK version cannot be empty');
  });
});

describe('encryption services', () => {
  test('isEnabled returns false when no keys configured', () => {
    const svc = createEncryptionServices({ kekKeysRaw: undefined });
    expect(svc.isEnabled()).toBe(false);
  });

  test('isEnabled returns true when keys configured', () => {
    const hex = generateHexKey();
    const svc = createEncryptionServices({ kekKeysRaw: `1:${hex}` });
    expect(svc.isEnabled()).toBe(true);
  });

  test('encrypt and decrypt roundtrip', () => {
    const hex = generateHexKey();
    const svc = createEncryptionServices({ kekKeysRaw: `1:${hex}` });

    const plaintext = Buffer.from('Hello, Arkivra!');
    const encrypted = svc.encrypt(plaintext);

    expect(encrypted.kekVersion).toBe('1');
    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.wrappedDek).toBeTruthy();
    expect(encrypted.encryptedData).not.toEqual(plaintext);

    const decrypted = svc.decrypt({
      encryptedData: encrypted.encryptedData,
      wrappedDek: encrypted.wrappedDek,
      kekVersion: encrypted.kekVersion,
    });

    expect(decrypted.toString()).toBe('Hello, Arkivra!');
  });

  test('encrypt uses highest version KEK', () => {
    const hex1 = generateHexKey();
    const hex2 = generateHexKey();
    const svc = createEncryptionServices({ kekKeysRaw: `1:${hex1},3:${hex2}` });

    const encrypted = svc.encrypt(Buffer.from('test'));
    expect(encrypted.kekVersion).toBe('3');
  });

  test('decrypt with old KEK version still works', () => {
    const hex1 = generateHexKey();
    const hex2 = generateHexKey();

    // Encrypt with only version 1
    const svc1 = createEncryptionServices({ kekKeysRaw: `1:${hex1}` });
    const encrypted = svc1.encrypt(Buffer.from('secret data'));

    // Decrypt with both versions available
    const svc2 = createEncryptionServices({ kekKeysRaw: `1:${hex1},2:${hex2}` });
    const decrypted = svc2.decrypt({
      encryptedData: encrypted.encryptedData,
      wrappedDek: encrypted.wrappedDek,
      kekVersion: encrypted.kekVersion,
    });

    expect(decrypted.toString()).toBe('secret data');
  });

  test('throws when encrypting without keys', () => {
    const svc = createEncryptionServices({ kekKeysRaw: undefined });
    expect(() => svc.encrypt(Buffer.from('test'))).toThrow('No KEK keys configured');
  });

  test('throws when decrypting with missing KEK version', () => {
    const hex = generateHexKey();
    const svc = createEncryptionServices({ kekKeysRaw: `1:${hex}` });

    const encrypted = svc.encrypt(Buffer.from('test'));

    const svc2 = createEncryptionServices({ kekKeysRaw: `2:${generateHexKey()}` });
    expect(() =>
      svc2.decrypt({
        encryptedData: encrypted.encryptedData,
        wrappedDek: encrypted.wrappedDek,
        kekVersion: '1',
      }),
    ).toThrow('KEK version "1" not found');
  });

  test('different encryptions produce different ciphertexts (unique DEK per call)', () => {
    const hex = generateHexKey();
    const svc = createEncryptionServices({ kekKeysRaw: `1:${hex}` });

    const plaintext = Buffer.from('same content');
    const enc1 = svc.encrypt(plaintext);
    const enc2 = svc.encrypt(plaintext);

    expect(enc1.encryptedData).not.toEqual(enc2.encryptedData);
    expect(enc1.wrappedDek).not.toBe(enc2.wrappedDek);
  });
});

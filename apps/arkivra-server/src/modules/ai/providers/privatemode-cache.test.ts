import { afterEach, describe, expect, it, vi } from 'vitest';
import { privatemodeCacheSalt } from './privatemode-cache.js';

afterEach(() => vi.unstubAllEnvs());
describe('isolated Privatemode cache salts', () => {
  it('reuses a namespace and separates users, vaults, operations and secret rotations', () => {
    vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', 'a'.repeat(64));
    const scope = ['chat', 'user_a', 'vault_a'];
    const salt = privatemodeCacheSalt(scope);
    expect(salt).toMatch(/^[a-f\d]{64}$/);
    expect(privatemodeCacheSalt(scope)).toBe(salt);
    for (const other of [
      ['chat', 'user_b', 'vault_a'], ['chat', 'user_a', 'vault_b'],
      ['translation', 'user_a', 'vault_a'], ['chat', 'user', 'a:vault_a'],
    ]) expect(privatemodeCacheSalt(other)).not.toBe(salt);
    vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', 'b'.repeat(64));
    expect(privatemodeCacheSalt(scope)).not.toBe(salt);
  });
  it('does not share caches without a secret or complete scope', () => {
    vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', '');
    expect(privatemodeCacheSalt(['chat', 'user_a'])).toBeUndefined();
    vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', 'a'.repeat(64));
    expect(privatemodeCacheSalt(undefined)).toBeUndefined();
    expect(privatemodeCacheSalt([])).toBeUndefined();
    expect(privatemodeCacheSalt(['chat', ''])).toBeUndefined();
  });
  it('rejects a malformed configured secret', () => {
    vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', 'weak');
    expect(() => privatemodeCacheSalt(['chat', 'user_a'])).toThrow('32-byte hex secret');
  });
});

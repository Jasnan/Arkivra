import { createHmac } from 'node:crypto';

/** Secret, stable cache namespaces; raw user/vault identifiers never leave Arkivra. */
export function privatemodeCacheSalt(scope: readonly string[] | undefined) {
  const secret = process.env.ARKIVRA_PRIVATEMODE_CACHE_SECRET;
  if (!secret || !scope?.length || scope.some((part) => !part)) return undefined;
  if (!/^[a-f\d]{64}$/i.test(secret)) {
    throw new Error('ARKIVRA_PRIVATEMODE_CACHE_SECRET must be a randomly generated 32-byte hex secret.');
  }
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(JSON.stringify(['arkivra:privatemode:cache:v1', ...scope]))
    .digest('hex');
}

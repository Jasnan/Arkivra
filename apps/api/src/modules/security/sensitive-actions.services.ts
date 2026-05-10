import type { Auth } from '../auth/auth.services.js';
import type { Database } from '../database/database.js';
import type { Session } from 'better-auth';
import { eq } from 'drizzle-orm';
import { generateRandomString, symmetricEncrypt } from 'better-auth/crypto';
import { authAccountsTable, authTwoFactorTable } from '../database/schema/index.js';

const RECENT_OAUTH_REAUTH_MS = 10 * 60 * 1000;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type AuthAccount = typeof authAccountsTable.$inferSelect;

function getSessionAgeMs(session: Session) {
  const sessionWithTimestamps = session as Session & {
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };
  const timestamp = sessionWithTimestamps.updatedAt ?? sessionWithTimestamps.createdAt;

  if (!timestamp) return Number.POSITIVE_INFINITY;

  return Date.now() - new Date(timestamp).getTime();
}

function generateBackupCodes() {
  return Array.from({ length: 10 }, () => {
    const code = generateRandomString(10, 'a-z', '0-9', 'A-Z');
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

function toBase32(value: string) {
  const bytes = new TextEncoder().encode(value);
  let bits = 0;
  let buffer = 0;
  let output = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }

  return output;
}

function createTotpUri({
  account,
  issuer,
  secret,
}: {
  account: string;
  issuer: string;
  secret: string;
}) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: toBase32(secret),
    issuer,
    digits: '6',
    period: '30',
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

export function createSensitiveActionServices({
  auth,
  db,
}: {
  auth: Auth;
  db: Database;
}) {
  async function listAuthAccounts({ userId }: { userId: string }) {
    return db
      .select()
      .from(authAccountsTable)
      .where(eq(authAccountsTable.userId, userId));
  }

  function summarizeAuthMethods(accounts: AuthAccount[]) {
    const hasPassword = accounts.some(account => account.providerId === 'credential' && account.password);
    const oauthProviders = accounts
      .filter(account => account.providerId !== 'credential')
      .map(account => account.providerId);

    return {
      hasPassword,
      oauthProviders,
      primaryOAuthProvider: oauthProviders[0] ?? null,
    };
  }

  async function verifySensitiveAction({
    accounts,
    password,
    session,
    userId,
  }: {
    accounts: AuthAccount[];
    password?: string;
    session: Session;
    userId: string;
  }) {
    const credentialAccount = accounts.find(account => account.providerId === 'credential' && account.password);

    if (credentialAccount?.password) {
      if (!password) return false;

      const authContext = await auth.$context;
      return authContext.password.verify({
        hash: credentialAccount.password,
        password,
      });
    }

    const oauthAccount = accounts.find(account => account.providerId !== 'credential');

    if (!oauthAccount) return false;

    return session.userId === userId && getSessionAgeMs(session) <= RECENT_OAUTH_REAUTH_MS;
  }

  async function startTwoFactorSetup({
    password,
    session,
    user,
  }: {
    password?: string;
    session: Session;
    user: { email: string; id: string };
  }) {
    const accounts = await listAuthAccounts({ userId: user.id });
    const verified = await verifySensitiveAction({
      accounts,
      password,
      session,
      userId: user.id,
    });

    if (!verified) {
      return null;
    }

    const authContext = await auth.$context;
    const secret = generateRandomString(32);
    const backupCodes = generateBackupCodes();
    const [encryptedSecret, encryptedBackupCodes] = await Promise.all([
      symmetricEncrypt({
        key: authContext.secretConfig,
        data: secret,
      }),
      symmetricEncrypt({
        key: authContext.secretConfig,
        data: JSON.stringify(backupCodes),
      }),
    ]);

    await db
      .delete(authTwoFactorTable)
      .where(eq(authTwoFactorTable.userId, user.id));

    await db.insert(authTwoFactorTable).values({
      id: generateRandomString(32),
      secret: encryptedSecret,
      backupCodes: encryptedBackupCodes,
      userId: user.id,
    });

    return {
      backupCodes,
      totpURI: createTotpUri({
        account: user.email,
        issuer: authContext.appName,
        secret,
      }),
    };
  }

  return {
    listAuthAccounts,
    startTwoFactorSetup,
    summarizeAuthMethods,
  };
}

export type SensitiveActionServices = ReturnType<typeof createSensitiveActionServices>;

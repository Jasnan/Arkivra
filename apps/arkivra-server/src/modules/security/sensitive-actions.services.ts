import type { Auth } from '../auth/auth.services.js';
import type { Database } from '../database/database.js';
import type { Session } from 'better-auth';
import { and, eq, sql } from 'drizzle-orm';
import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { authAccountsTable, authTwoFactorTable, usersTable } from '../database/schema/index.js';

const RECENT_OAUTH_REAUTH_MS = 10 * 60 * 1000;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

type AuthAccount = typeof authAccountsTable.$inferSelect;
export type LinkableOAuthProvider = 'github' | 'google';

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

function parseBackupCodes(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : null;
  }
  catch {
    return null;
  }
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

  async function getTwoFactorSummary({ userId }: { userId: string }) {
    const authContext = await auth.$context;
    const [twoFactor] = await db
      .select({
        backupCodes: authTwoFactorTable.backupCodes,
        createdAt: authTwoFactorTable.createdAt,
        updatedAt: authTwoFactorTable.updatedAt,
      })
      .from(authTwoFactorTable)
      .where(eq(authTwoFactorTable.userId, userId))
      .limit(1);

    if (twoFactor === undefined) {
      return {
        authenticatorLinkedAt: null,
        backupCodeCount: null,
        backupCodesUpdatedAt: null,
      };
    }

    const decryptedBackupCodes = await symmetricDecrypt({
      key: authContext.secretConfig,
      data: twoFactor.backupCodes,
    }).catch(() => null);
    const backupCodes = decryptedBackupCodes ? parseBackupCodes(decryptedBackupCodes) : null;

    return {
      authenticatorLinkedAt: twoFactor.createdAt.toISOString(),
      backupCodeCount: backupCodes?.length ?? null,
      backupCodesUpdatedAt: twoFactor.updatedAt.toISOString(),
    };
  }

  async function regenerateBackupCodes({
    password,
    session,
    userId,
  }: {
    password?: string;
    session: Session;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });
    const verified = await verifySensitiveAction({
      accounts,
      password,
      session,
      userId,
    });

    if (!verified) {
      return null;
    }

    const [twoFactor] = await db
      .select({ id: authTwoFactorTable.id })
      .from(authTwoFactorTable)
      .where(eq(authTwoFactorTable.userId, userId))
      .limit(1);

    if (twoFactor === undefined) {
      return null;
    }

    const authContext = await auth.$context;
    const backupCodes = generateBackupCodes();
    const encryptedBackupCodes = await symmetricEncrypt({
      key: authContext.secretConfig,
      data: JSON.stringify(backupCodes),
    });

    await db
      .update(authTwoFactorTable)
      .set({
        backupCodes: encryptedBackupCodes,
        updatedAt: sql`now()`,
      })
      .where(eq(authTwoFactorTable.id, twoFactor.id));

    return {
      backupCodeCount: backupCodes.length,
      backupCodes,
    };
  }

  async function disableTwoFactor({
    password,
    session,
    userId,
  }: {
    password?: string;
    session: Session;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });
    const verified = await verifySensitiveAction({
      accounts,
      password,
      session,
      userId,
    });

    if (!verified) {
      return false;
    }

    await db
      .delete(authTwoFactorTable)
      .where(eq(authTwoFactorTable.userId, userId));

    await db
      .update(usersTable)
      .set({
        twoFactorEnabled: false,
        updatedAt: sql`now()`,
      })
      .where(eq(usersTable.id, userId));

    return true;
  }

  async function requestEmailChange({
    callbackURL,
    headers,
    newEmail,
    password,
    userId,
  }: {
    callbackURL?: string;
    headers: Headers;
    newEmail: string;
    password?: string;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });
    const credentialAccount = accounts.find(account => account.providerId === 'credential' && account.password);

    if (!credentialAccount?.password) {
      return 'password-unavailable' as const;
    }

    if (!password) {
      return 'verification-failed' as const;
    }

    const authContext = await auth.$context;
    const verified = await authContext.password.verify({
      hash: credentialAccount.password,
      password,
    });

    if (!verified) {
      return 'verification-failed' as const;
    }

    const normalizedEmail = newEmail.trim().toLowerCase();
    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (existingUser && existingUser.id !== userId) {
      return 'email-in-use' as const;
    }

    return auth.api.changeEmail({
      body: {
        callbackURL,
        newEmail: normalizedEmail,
      },
      headers,
    });
  }

  async function linkOAuthAccount({
    callbackURL,
    headers,
    password,
    provider,
    userId,
  }: {
    callbackURL?: string;
    headers: Headers;
    password: string;
    provider: LinkableOAuthProvider;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });

    if (accounts.some(account => account.providerId === provider)) {
      return 'already-linked' as const;
    }

    const credentialAccount = accounts.find(account => account.providerId === 'credential' && account.password);

    if (!credentialAccount?.password) {
      return 'password-unavailable' as const;
    }

    const authContext = await auth.$context;
    const verified = await authContext.password.verify({
      hash: credentialAccount.password,
      password,
    });

    if (!verified) {
      return 'verification-failed' as const;
    }

    return auth.api.linkSocialAccount({
      asResponse: true,
      body: {
        callbackURL,
        provider,
      },
      headers,
    });
  }

  async function unlinkOAuthAccount({
    provider,
    userId,
  }: {
    provider: LinkableOAuthProvider;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });
    const providerAccount = accounts.find(account => account.providerId === provider);

    if (!providerAccount) {
      return 'not-linked' as const;
    }

    const hasPassword = accounts.some(account => account.providerId === 'credential' && account.password);
    const hasOtherOAuthProvider = accounts.some(account =>
      account.providerId !== 'credential' && account.providerId !== provider,
    );

    if (!hasPassword && !hasOtherOAuthProvider) {
      return 'last-login-method' as const;
    }

    await db
      .delete(authAccountsTable)
      .where(and(
        eq(authAccountsTable.userId, userId),
        eq(authAccountsTable.providerId, provider),
      ));

    return 'success' as const;
  }

  async function changeAccountPassword({
    currentPassword,
    newPassword,
    userId,
  }: {
    currentPassword: string;
    newPassword: string;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });
    const credentialAccount = accounts.find(account => account.providerId === 'credential' && account.password);

    if (!credentialAccount?.password) {
      return 'password-unavailable' as const;
    }

    const authContext = await auth.$context;
    const minPasswordLength = authContext.password.config.minPasswordLength;
    const maxPasswordLength = authContext.password.config.maxPasswordLength;

    if (newPassword.length < minPasswordLength) {
      return 'password-too-short' as const;
    }

    if (newPassword.length > maxPasswordLength) {
      return 'password-too-long' as const;
    }

    const verified = await authContext.password.verify({
      hash: credentialAccount.password,
      password: currentPassword,
    });

    if (!verified) {
      return 'verification-failed' as const;
    }

    const passwordHash = await authContext.password.hash(newPassword);

    await db
      .update(authAccountsTable)
      .set({
        password: passwordHash,
        updatedAt: sql`now()`,
      })
      .where(eq(authAccountsTable.id, credentialAccount.id));

    return 'success' as const;
  }

  async function setAccountPassword({
    newPassword,
    session,
    userId,
  }: {
    newPassword: string;
    session: Session;
    userId: string;
  }) {
    const accounts = await listAuthAccounts({ userId });

    if (accounts.some(account => account.providerId === 'credential' && account.password)) {
      return 'already-set' as const;
    }

    const verified = await verifySensitiveAction({
      accounts,
      session,
      userId,
    });

    if (!verified) {
      return 'verification-failed' as const;
    }

    const authContext = await auth.$context;
    const minPasswordLength = authContext.password.config.minPasswordLength;
    const maxPasswordLength = authContext.password.config.maxPasswordLength;

    if (newPassword.length < minPasswordLength) {
      return 'password-too-short' as const;
    }

    if (newPassword.length > maxPasswordLength) {
      return 'password-too-long' as const;
    }

    const passwordHash = await authContext.password.hash(newPassword);
    const credentialAccount = accounts.find(account => account.providerId === 'credential');

    if (credentialAccount) {
      await db
        .update(authAccountsTable)
        .set({
          password: passwordHash,
          updatedAt: sql`now()`,
        })
        .where(eq(authAccountsTable.id, credentialAccount.id));
    }
    else {
      await db.insert(authAccountsTable).values({
        id: generateRandomString(32),
        accountId: userId,
        providerId: 'credential',
        password: passwordHash,
        userId,
      });
    }

    return 'success' as const;
  }

  return {
    changeAccountPassword,
    disableTwoFactor,
    getTwoFactorSummary,
    linkOAuthAccount,
    listAuthAccounts,
    regenerateBackupCodes,
    requestEmailChange,
    setAccountPassword,
    startTwoFactorSetup,
    summarizeAuthMethods,
    unlinkOAuthAccount,
  };
}

export type SensitiveActionServices = ReturnType<typeof createSensitiveActionServices>;

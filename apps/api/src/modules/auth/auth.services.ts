import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { google, github } from 'better-auth/social-providers';
import {
  authAccountsTable,
  authSessionsTable,
  authTwoFactorTable,
  authVerificationsTable,
} from '../database/schema/auth.table.js';
import { usersTable } from '../database/schema/users.table.js';

export type Auth = ReturnType<typeof createAuth>['auth'];

function buildPlugins(config: Config) {
  const plugins: ReturnType<typeof twoFactor>[] = [twoFactor()];

  if (config.auth.googleClientId && config.auth.googleClientSecret) {
    plugins.push(
      google({
        clientId: config.auth.googleClientId,
        clientSecret: config.auth.googleClientSecret,
      }),
    );
  }

  if (config.auth.githubClientId && config.auth.githubClientSecret) {
    plugins.push(
      github({
        clientId: config.auth.githubClientId,
        clientSecret: config.auth.githubClientSecret,
      }),
    );
  }

  return plugins;
}

export function createAuth({ db, config }: { db: Database; config: Config }) {
  const auth = betterAuth({
    secret: config.auth.secret,
    baseURL: config.server.baseUrl,
    trustedOrigins: config.auth.trustedOrigins,

    appName: 'Arkivra',

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: config.auth.isEmailVerificationRequired,
    },

    account: {
      accountLinking: {
        enabled: true,
      },
    },

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: usersTable,
        account: authAccountsTable,
        session: authSessionsTable,
        verification: authVerificationsTable,
        twoFactor: authTwoFactorTable,
      },
    }),

    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },

    plugins: buildPlugins(config),
  });

  return { auth };
}

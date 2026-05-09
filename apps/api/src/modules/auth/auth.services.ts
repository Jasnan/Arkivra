import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import {
  authAccountsTable,
  authSessionsTable,
  authTwoFactorTable,
  authVerificationsTable,
} from '../database/schema/auth.table.js';
import { usersTable } from '../database/schema/users.table.js';

export type Auth = ReturnType<typeof createAuth>['auth'];

function getOAuthRedirectUri(config: Config, provider: 'google' | 'github') {
  const baseUrl = new URL(config.auth.baseUrl ?? config.server.baseUrl);
  return new URL(`/api/auth/callback/${provider}`, baseUrl.origin).toString();
}

function buildSocialProviders(config: Config) {
  const hasGoogle = Boolean(config.auth.googleClientId && config.auth.googleClientSecret);
  const hasGithub = Boolean(config.auth.githubClientId && config.auth.githubClientSecret);

  return {
    ...(hasGoogle
      ? {
          google: {
            clientId: config.auth.googleClientId!,
            clientSecret: config.auth.googleClientSecret!,
            redirectURI: config.auth.googleRedirectUri ?? getOAuthRedirectUri(config, 'google'),
          },
        }
      : {}),
    ...(hasGithub
      ? {
          github: {
            clientId: config.auth.githubClientId!,
            clientSecret: config.auth.githubClientSecret!,
          },
        }
      : {}),
  };
}

function buildPlugins() {
  return [twoFactor()];
}

export function createAuth({ db, config }: { db: Database; config: Config }) {
  if (config.auth.googleClientId && config.auth.googleClientSecret) {
    console.info(
      `Google OAuth redirect URI: ${config.auth.googleRedirectUri ?? getOAuthRedirectUri(config, 'google')}`,
    );
  }

  if (config.auth.githubClientId && config.auth.githubClientSecret) {
    console.info(`GitHub OAuth redirect URI: ${getOAuthRedirectUri(config, 'github')}`);
  }

  const auth = betterAuth({
    secret: config.auth.secret,
    baseURL: config.auth.baseUrl ?? config.server.baseUrl,
    trustedOrigins: config.auth.trustedOrigins,

    appName: 'Arkivra',

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: config.auth.isEmailVerificationRequired,
    },

    socialProviders: buildSocialProviders(config),

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

    plugins: buildPlugins(),
  });

  return { auth };
}

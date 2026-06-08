import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import type { BetterAuthPlugin, Session, User } from 'better-auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import {
  authAccountsTable,
  authSessionsTable,
  authTwoFactorTable,
  authVerificationsTable,
} from '../database/schema/auth.table.js';
import { usersTable } from '../database/schema/users.table.js';
import { createAuditServices } from '../audit/audit.services.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import { createAuthEmailServices } from './auth-email.services.js';
import { oauthTwoFactorChallengePlugin } from './oauth-two-factor.plugin.js';

type BetterAuthContext = Awaited<ReturnType<typeof betterAuth>['$context']>;

export type Auth = {
  $context: Promise<{
    appName: string;
    password: Pick<BetterAuthContext['password'], 'config' | 'hash' | 'verify'>;
    secretConfig: BetterAuthContext['secretConfig'];
  }>;
  api: {
    changeEmail(input: {
      body: {
        callbackURL?: string;
        newEmail: string;
      };
      headers: Headers;
    }): Promise<unknown>;
    getSession(input: { headers: Headers }): Promise<{ session: Session; user: User } | null>;
    linkSocialAccount(input: {
      asResponse: true;
      body: {
        callbackURL?: string;
        provider: 'github' | 'google';
      };
      headers: Headers;
    }): Promise<Response>;
  };
  handler(request: Request): Promise<Response>;
};

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
            redirectURI: config.auth.githubRedirectUri ?? getOAuthRedirectUri(config, 'github'),
          },
        }
      : {}),
  };
}

type AuthAuditUser = Pick<User, 'email' | 'id' | 'name'> & {
  twoFactorEnabled?: boolean;
};

type OAuthLinkAuditState = {
  email: string;
  provider: string;
  userId: string;
};

function getAuditRequestContext(request?: Request) {
  const forwardedFor = request?.headers.get('x-forwarded-for');

  return {
    ipAddress: request?.headers.get('cf-connecting-ip')
      ?? request?.headers.get('x-real-ip')
      ?? forwardedFor?.split(',')[0]?.trim()
      ?? null,
    userAgent: request?.headers.get('user-agent') ?? null,
    requestId: request?.headers.get('x-request-id') ?? request?.headers.get('x-correlation-id') ?? null,
  };
}

function getActor(user: AuthAuditUser | null | undefined) {
  return {
    id: user?.id ?? null,
    type: user?.id ? 'user' as const : 'unknown' as const,
    displayName: user?.name?.trim() || user?.email?.trim() || null,
  };
}

function getTarget(user: AuthAuditUser | null | undefined) {
  return {
    type: 'user',
    id: user?.id ?? null,
    displayName: user?.name?.trim() || user?.email?.trim() || null,
  };
}

function decodeBase64UrlJson(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

function getEmailChangeVerificationPayload(request?: Request) {
  if (!request) return null;

  const token = new URL(request.url).searchParams.get('token');
  const payloadSegment = token?.split('.')[1];
  if (!payloadSegment) return null;

  const payload = decodeBase64UrlJson(payloadSegment);
  if (typeof payload !== 'object' || payload === null) return null;

  const {
    email,
    requestType,
    updateTo,
  } = payload as {
    email?: unknown;
    requestType?: unknown;
    updateTo?: unknown;
  };

  if (
    requestType !== 'change-email-verification'
    || typeof email !== 'string'
    || typeof updateTo !== 'string'
  ) {
    return null;
  }

  return {
    currentEmail: email,
    newEmail: updateTo,
  };
}

function getProviderFromCallbackRequest(request?: Request) {
  if (!request) return null;

  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/callback\/([^/?#]+)/);
  return match?.[1] ?? null;
}

async function getOAuthLinkAuditState(context: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]) {
  const provider = getProviderFromCallbackRequest(context.request);
  const state = new URL(context.request?.url ?? 'http://localhost').searchParams.get('state');

  if (!provider || !state) {
    return null;
  }

  const verification = await context.context.internalAdapter.findVerificationValue(state).catch(() => null);

  if (!verification?.value) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(verification.value);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const link = (parsed as { link?: unknown }).link;
  if (typeof link !== 'object' || link === null) {
    return null;
  }

  const { email, userId } = link as { email?: unknown; userId?: unknown };
  if (typeof email !== 'string' || typeof userId !== 'string') {
    return null;
  }

  return {
    email,
    provider,
    userId,
  };
}

function isSuccessfulOAuthRedirect(context: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]) {
  const location = context.context.responseHeaders?.get('location');
  if (!location) {
    return false;
  }

  try {
    const url = new URL(location);
    return !url.searchParams.has('error');
  } catch {
    return !location.includes('error=');
  }
}

function accountSecurityAuditPlugin({ db }: { db: Database }): BetterAuthPlugin {
  const auditServices = createAuditServices({ db });

  return {
    id: 'arkivra-account-security-audit',
    hooks: {
      before: [
        {
          matcher(context) {
            return context.path === '/callback/:id';
          },
          handler: createAuthMiddleware(async (context) => {
            const linkAuditState = await getOAuthLinkAuditState(context);

            if (!linkAuditState) {
              return;
            }

            return {
              context: {
                arkivraOAuthLinkAudit: linkAuditState,
              },
            };
          }),
        },
      ],
      after: [
        {
          matcher(context) {
            return context.path === '/callback/:id';
          },
          handler: createAuthMiddleware(async (context) => {
            const linkAuditState = (context.context as unknown as {
              arkivraOAuthLinkAudit?: OAuthLinkAuditState;
            }).arkivraOAuthLinkAudit;

            if (!linkAuditState || !isSuccessfulOAuthRedirect(context)) {
              return;
            }

            const accounts = await context.context.internalAdapter.findAccounts(linkAuditState.userId).catch(() => []);
            const linked = accounts.some(account => account.providerId === linkAuditState.provider);

            if (!linked) {
              return;
            }

            const user = await context.context.internalAdapter.findUserById(linkAuditState.userId) as AuthAuditUser | null;
            const auditUser = user ?? {
              email: linkAuditState.email,
              id: linkAuditState.userId,
              name: '',
            };

            await auditServices.emitAuditEvent({
              eventType: AUDIT_EVENT_TYPES.authOAuthLinked,
              eventCategory: 'auth',
              severity: 'notice',
              outcome: 'success',
              actor: getActor(auditUser),
              target: getTarget(auditUser),
              source: 'api',
              requestContext: getAuditRequestContext(context.request),
              metadata: {
                provider: linkAuditState.provider,
                verification_method: 'password',
              },
              after: { provider: linkAuditState.provider },
            }).catch(error => console.error('Failed to write OAuth link audit event', error));
          }),
        },
        {
          matcher(context) {
            return context.path === '/change-password';
          },
          handler: createAuthMiddleware(async (context) => {
            const returned = context.context.returned as { user?: AuthAuditUser } | undefined;
            const session = (context.context as unknown as { session?: { user?: AuthAuditUser } }).session;
            const user = returned?.user ?? session?.user ?? null;

            await auditServices.emitAuditEvent({
              eventType: AUDIT_EVENT_TYPES.authPasswordChanged,
              eventCategory: 'auth',
              severity: 'notice',
              outcome: 'success',
              actor: getActor(user),
              target: getTarget(user),
              source: 'api',
              requestContext: getAuditRequestContext(context.request),
              metadata: { revoke_other_sessions: false },
            }).catch(error => console.error('Failed to write password change audit event', error));
          }),
        },
        {
          matcher(context) {
            return context.path === '/two-factor/verify-totp';
          },
          handler: createAuthMiddleware(async (context) => {
            const session = (context.context as unknown as { session?: { user?: AuthAuditUser } }).session;
            const sessionUser = session?.user;

            if (!sessionUser || sessionUser.twoFactorEnabled === true) {
              return;
            }

            const latestUser = await context.context.internalAdapter.findUserById(sessionUser.id) as AuthAuditUser | null;

            if (latestUser?.twoFactorEnabled !== true) {
              return;
            }

            await auditServices.emitAuditEvent({
              eventType: AUDIT_EVENT_TYPES.authTwoFactorEnabled,
              eventCategory: 'auth',
              severity: 'notice',
              outcome: 'success',
              actor: getActor(latestUser),
              target: getTarget(latestUser),
              source: 'api',
              requestContext: getAuditRequestContext(context.request),
              metadata: { method: 'totp' },
              before: { two_factor_enabled: false },
              after: { two_factor_enabled: true },
            }).catch(error => console.error('Failed to write 2FA enable audit event', error));
          }),
        },
        {
          matcher(context) {
            return context.path === '/two-factor/disable';
          },
          handler: createAuthMiddleware(async (context) => {
            const session = (context.context as unknown as { session?: { user?: AuthAuditUser } }).session;
            const sessionUser = session?.user;

            if (!sessionUser) {
              return;
            }

            await auditServices.emitAuditEvent({
              eventType: AUDIT_EVENT_TYPES.authTwoFactorDisabled,
              eventCategory: 'auth',
              severity: 'warning',
              outcome: 'success',
              actor: getActor(sessionUser),
              target: getTarget(sessionUser),
              source: 'api',
              requestContext: getAuditRequestContext(context.request),
              metadata: { method: 'password' },
              before: { two_factor_enabled: true },
              after: { two_factor_enabled: false },
            }).catch(error => console.error('Failed to write 2FA disable audit event', error));
          }),
        },
      ],
    },
  };
}

function buildPlugins(config: Config, db: Database) {
  return [
    twoFactor(),
    oauthTwoFactorChallengePlugin({
      webBaseUrl: config.server.webBaseUrl,
    }),
    accountSecurityAuditPlugin({ db }),
  ];
}

export function createAuth({ db, config }: { db: Database; config: Config }): { auth: Auth } {
  const authEmailServices = createAuthEmailServices({ config });
  const auditServices = createAuditServices({ db });

  if (config.auth.googleClientId && config.auth.googleClientSecret) {
    console.info(
      `Google OAuth redirect URI: ${config.auth.googleRedirectUri ?? getOAuthRedirectUri(config, 'google')}`,
    );
  }

  if (config.auth.githubClientId && config.auth.githubClientSecret) {
    console.info(
      `GitHub OAuth redirect URI: ${config.auth.githubRedirectUri ?? getOAuthRedirectUri(config, 'github')}`,
    );
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

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: config.auth.isEmailVerificationRequired,
      autoSignInAfterVerification: true,
      async afterEmailVerification(user, request) {
        const emailChange = getEmailChangeVerificationPayload(request);

        if (!emailChange) {
          return;
        }

        await authEmailServices.sendEmail({
          to: emailChange.currentEmail,
          subject: 'Your Arkivra email was changed',
          text: [
            `Hi ${user.name || emailChange.currentEmail},`,
            '',
            `Your Arkivra email address was changed to ${emailChange.newEmail}.`,
            '',
            'If you did not make this change, contact your Arkivra administrator immediately.',
          ].join('\n'),
        }).catch(error => console.error('Failed to send email change notification', error));

        await auditServices.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.authEmailChanged,
          eventCategory: 'auth',
          severity: 'notice',
          outcome: 'success',
          actor: {
            id: user.id,
            type: 'user',
            displayName: user.name?.trim() || emailChange.currentEmail,
          },
          target: {
            type: 'user',
            id: user.id,
            displayName: user.name?.trim() || emailChange.newEmail,
          },
          source: 'api',
          requestContext: getAuditRequestContext(request),
          metadata: { verification_method: 'email' },
          before: { email: emailChange.currentEmail },
          after: { email: emailChange.newEmail },
        }).catch(error => console.error('Failed to write email change audit event', error));
      },
      async sendVerificationEmail({ user, url }) {
        await authEmailServices.sendEmail({
          to: user.email,
          subject: 'Verify your Arkivra email',
          text: [
            `Hi ${user.name || user.email},`,
            '',
            'Verify your email address to finish setting up your Arkivra account:',
            url,
            '',
            'If you did not request this email, you can ignore it.',
          ].join('\n'),
        });
      },
    },

    socialProviders: buildSocialProviders(config),

    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
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
      changeEmail: {
        enabled: true,
        async sendChangeEmailConfirmation({ newEmail, url, user }) {
          await authEmailServices.sendEmail({
            to: user.email,
            subject: 'Confirm your Arkivra email change',
            text: [
              `Hi ${user.name || user.email},`,
              '',
              `Confirm that you want to change your Arkivra email address to ${newEmail}:`,
              url,
              '',
              'If you did not request this email change, keep your current email and ignore this message.',
            ].join('\n'),
          });
        },
      },
      deleteUser: { enabled: false },
    },

    plugins: buildPlugins(config, db),
  });

  return { auth: auth as unknown as Auth };
}

import { createHmac } from 'node:crypto';
import type { BetterAuthPlugin, User } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { deleteSessionCookie, expireCookie } from 'better-auth/cookies';
import { generateRandomString } from 'better-auth/crypto';

const TWO_FACTOR_COOKIE_NAME = 'two_factor';
const TWO_FACTOR_COOKIE_MAX_AGE = 600;
const TWO_FACTOR_VERIFY_PATH = '/two-factor/verify';
const TRUST_DEVICE_COOKIE_NAME = 'trust_device';
const TRUST_DEVICE_MAX_AGE = 720 * 60 * 60;

type NewSessionData = {
  session: { token: string };
  user: User & { twoFactorEnabled?: boolean };
};

type OAuthTwoFactorChallengeOptions = {
  webBaseUrl: string;
};

function getRedirectTarget(options: OAuthTwoFactorChallengeOptions) {
  return new URL(TWO_FACTOR_VERIFY_PATH, options.webBaseUrl).toString();
}

function isOAuthCallbackPath(path: string | undefined) {
  return path?.startsWith('/callback/') === true || path?.startsWith('/oauth2/callback/') === true;
}

function signTrustedDevice({
  secret,
  userId,
  trustIdentifier,
}: {
  secret: string;
  userId: string;
  trustIdentifier: string;
}) {
  return createHmac('sha256', secret).update(`${userId}!${trustIdentifier}`).digest('base64url');
}

export function oauthTwoFactorChallengePlugin(options: OAuthTwoFactorChallengeOptions): BetterAuthPlugin {
  return {
    id: 'arkivra-oauth-two-factor-challenge',
    hooks: {
      after: [
        {
          matcher(context) {
            return isOAuthCallbackPath(context.path);
          },
          handler: createAuthMiddleware(async (context) => {
            const newSession = context.context.newSession as NewSessionData | undefined;

            if (!newSession?.user.twoFactorEnabled) {
              return;
            }

            const hasTrustedDevice = async () => {
              const trustDeviceCookie = context.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, {
                maxAge: TRUST_DEVICE_MAX_AGE,
              });
              const trustDeviceValue = await context.getSignedCookie(
                trustDeviceCookie.name,
                context.context.secret,
              );

              if (!trustDeviceValue) {
                return false;
              }

              const [token, trustIdentifier] = trustDeviceValue.split('!');

              if (token && trustIdentifier) {
                const expectedToken = signTrustedDevice({
                  secret: context.context.secret,
                  userId: newSession.user.id,
                  trustIdentifier,
                });

                if (token === expectedToken) {
                  const verificationRecord =
                    await context.context.internalAdapter.findVerificationValue(trustIdentifier);

                  if (
                    verificationRecord
                    && verificationRecord.value === newSession.user.id
                    && verificationRecord.expiresAt > new Date()
                  ) {
                    await context.context.internalAdapter.deleteVerificationByIdentifier(trustIdentifier);

                    const nextTrustIdentifier = `trust-device-${generateRandomString(32)}`;
                    const nextToken = signTrustedDevice({
                      secret: context.context.secret,
                      userId: newSession.user.id,
                      trustIdentifier: nextTrustIdentifier,
                    });

                    await context.context.internalAdapter.createVerificationValue({
                      value: newSession.user.id,
                      identifier: nextTrustIdentifier,
                      expiresAt: new Date(Date.now() + TRUST_DEVICE_MAX_AGE * 1000),
                    });
                    await context.setSignedCookie(
                      trustDeviceCookie.name,
                      `${nextToken}!${nextTrustIdentifier}`,
                      context.context.secret,
                      trustDeviceCookie.attributes,
                    );

                    return true;
                  }
                }
              }

              expireCookie(context, trustDeviceCookie);
              return false;
            };

            if (await hasTrustedDevice()) {
              return;
            }

            deleteSessionCookie(context, true);
            await context.context.internalAdapter.deleteSession(newSession.session.token);

            const twoFactorCookie = context.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
              maxAge: TWO_FACTOR_COOKIE_MAX_AGE,
            });
            const identifier = `2fa-${generateRandomString(20)}`;

            await context.context.internalAdapter.createVerificationValue({
              value: newSession.user.id,
              identifier,
              expiresAt: new Date(Date.now() + TWO_FACTOR_COOKIE_MAX_AGE * 1000),
            });
            await context.setSignedCookie(
              twoFactorCookie.name,
              identifier,
              context.context.secret,
              twoFactorCookie.attributes,
            );

            throw context.redirect(getRedirectTarget(options));
          }),
        },
      ],
    },
  };
}

import { fetchJson } from '@/lib/api';

export interface SensitiveActionAuthMethods {
  hasPassword: boolean;
  oauthProviders: string[];
  primaryOAuthProvider: string | null;
}

export type OAuthProviderId = 'github' | 'google';

export type SensitiveActionVerificationMethod =
  | { type: 'password' }
  | { provider: OAuthProviderId; type: 'oauth' }
  | { type: 'unavailable' };

export const OAUTH_PROVIDERS: Record<OAuthProviderId, { label: string }> = {
  github: { label: 'GitHub' },
  google: { label: 'Google' },
};

export const PENDING_SENSITIVE_ACTION_KEY = 'arkivra.pendingSensitiveAction';

function isKnownOAuthProvider(provider: string | null | undefined): provider is OAuthProviderId {
  return provider === 'google' || provider === 'github';
}

export function getSensitiveActionVerificationMethod(
  authMethods: SensitiveActionAuthMethods | null | undefined,
): SensitiveActionVerificationMethod {
  if (authMethods?.hasPassword) {
    return { type: 'password' };
  }

  const provider = authMethods?.oauthProviders.find(isKnownOAuthProvider)
    ?? authMethods?.primaryOAuthProvider;

  if (isKnownOAuthProvider(provider)) {
    return { type: 'oauth', provider };
  }

  return { type: 'unavailable' };
}

export async function startTwoFactorSensitiveSetup({ password }: { password?: string }) {
  return fetchJson<{ backupCodes: string[]; totpURI: string }>('/api/security/two-factor/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

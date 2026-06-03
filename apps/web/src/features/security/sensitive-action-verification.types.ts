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
export const TWO_FACTOR_SETUP_ACTION = 'two-factor-setup';
export const TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION = 'two-factor-replace-authenticator';
export const TWO_FACTOR_REGENERATE_CODES_ACTION = 'two-factor-regenerate-codes';
export const TWO_FACTOR_DISABLE_ACTION = 'two-factor-disable';
export const EMAIL_CHANGE_ACTION = 'email-change';
export const SET_PASSWORD_ACTION = 'set-password';
export const PENDING_EMAIL_CHANGE_KEY = 'arkivra.pendingEmailChange';

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

export async function regenerateTwoFactorBackupCodes({ password }: { password?: string }) {
  return fetchJson<{ backupCodes: string[]; backupCodeCount: number }>('/api/security/two-factor/backup-codes/regenerate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function disableTwoFactor({ password }: { password?: string }) {
  return fetchJson<{ status: boolean }>('/api/security/two-factor/disable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function requestEmailChange({
  callbackURL,
  newEmail,
  password,
}: {
  callbackURL?: string;
  newEmail: string;
  password?: string;
}) {
  return fetchJson<{ message?: string; status: boolean }>('/api/security/email/change', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callbackURL, newEmail, password }),
  });
}

export async function setAccountPassword({ newPassword }: { newPassword: string }) {
  return fetchJson<{ status: boolean }>('/api/security/password/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
}

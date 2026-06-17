import { createAuthClient } from 'better-auth/react';
import { genericOAuthClient, twoFactorClient } from 'better-auth/client/plugins';

function resolveBaseURL() {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_ARKIVRA_WEB_BASE_URL ?? 'http://localhost';
  }

  return window.location.origin;
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
  plugins: [genericOAuthClient(), twoFactorClient()],
});

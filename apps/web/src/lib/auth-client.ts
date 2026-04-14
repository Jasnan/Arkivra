import { createAuthClient } from 'better-auth/react';
import { genericOAuthClient, twoFactorClient } from 'better-auth/client/plugins';

function resolveBaseURL() {
  if (typeof window === 'undefined') {
    return 'http://localhost:5173';
  }

  return window.location.origin;
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
  plugins: [
    genericOAuthClient(),
    twoFactorClient(),
  ],
});

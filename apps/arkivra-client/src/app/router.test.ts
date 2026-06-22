import { describe, expect, test } from 'vitest';
import { ROUTES } from './routes';
import { shouldRedirectAuthenticatedPublicUser } from './router';

describe('public auth route redirects', () => {
  test('keeps authenticated users on the email verification page', () => {
    expect(shouldRedirectAuthenticatedPublicUser(ROUTES.emailVerification)).toBe(false);
  });

  test('redirects authenticated users away from other public auth pages', () => {
    expect(shouldRedirectAuthenticatedPublicUser(ROUTES.login)).toBe(true);
    expect(shouldRedirectAuthenticatedPublicUser(ROUTES.register)).toBe(true);
  });
});

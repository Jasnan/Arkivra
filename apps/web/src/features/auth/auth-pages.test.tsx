import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/features/auth/pages/login-page';
import { RegisterPage } from '@/features/auth/pages/register-page';
import { RequestPasswordResetPage } from '@/features/auth/pages/request-password-reset-page';
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page';
import { TwoFactorSetupPage } from '@/features/auth/pages/two-factor-setup-page';
import { TwoFactorVerifyPage } from '@/features/auth/pages/two-factor-verify-page';
import { renderWithProviders } from '@/test/utils';

const authClientMock = vi.hoisted(() => ({
  signIn: {
    email: vi.fn(),
    social: vi.fn(),
  },
  signUp: {
    email: vi.fn(),
  },
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  twoFactor: {
    enable: vi.fn(),
    verifyTotp: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
  useSession: vi.fn(() => ({ data: null, isPending: false })),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: authClientMock,
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('auth pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    authClientMock.useSession.mockReturnValue({ data: null, isPending: false });
    authClientMock.signIn.email.mockResolvedValue({ data: null, error: null });
    authClientMock.signIn.social.mockResolvedValue({ error: null });
    authClientMock.signUp.email.mockResolvedValue({ error: null });
    authClientMock.requestPasswordReset.mockResolvedValue({ error: null });
    authClientMock.resetPassword.mockResolvedValue({ error: null });
    authClientMock.twoFactor.enable.mockResolvedValue({
      data: {
        totpURI: 'otpauth://totp/Arkivra?secret=ABC123&issuer=Arkivra',
        backupCodes: ['backup-1', 'backup-2'],
      },
      error: null,
    });
    authClientMock.twoFactor.verifyTotp.mockResolvedValue({ error: null });
    authClientMock.twoFactor.verifyBackupCode.mockResolvedValue({ error: null });
  });

  it('submits the login form and supports OAuth buttons', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.click(screen.getByRole('button', { name: /github/i }));

    expect(authClientMock.signIn.email).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      password: 'secret123',
      rememberMe: true,
    }));
    expect(authClientMock.signIn.social).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: 'http://localhost:3000/',
    });
  });

  it('submits the register form', async () => {
    const user = userEvent.setup();

    await renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/name/i), 'Alex');
    await user.type(screen.getByLabelText(/email/i), 'alex@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(authClientMock.signUp.email).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Alex',
      email: 'alex@example.com',
      password: 'secret123',
    }));
  });

  it('submits the password reset request flow', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<RequestPasswordResetPage />);
    await user.type(screen.getByLabelText(/email/i), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(authClientMock.requestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alex@example.com',
    }));
    expect(await screen.findByText(/a reset link has been sent/i)).toBeInTheDocument();
  });

  it('resets password when a token is present', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ResetPasswordPage />, {
      initialEntries: ['/reset-password?token=tok_123'],
      routePath: '/reset-password',
    });

    await user.type(screen.getByLabelText(/new password/i), 'renewed123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(authClientMock.resetPassword).toHaveBeenCalledWith({
      token: 'tok_123',
      newPassword: 'renewed123',
    });
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('enables and verifies two-factor auth', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: [],
            primaryOAuthProvider: null,
          },
        });
      }

      if (url === '/api/security/two-factor/setup' && init?.method === 'POST') {
        return jsonResponse({
          totpURI: 'otpauth://totp/Arkivra?secret=ABC123&issuer=Arkivra',
          backupCodes: ['backup-1', 'backup-2'],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<TwoFactorSetupPage />);

    await user.type(await screen.findByLabelText(/current password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(fetchMock).toHaveBeenCalledWith('/api/security/two-factor/setup', expect.objectContaining({
      body: JSON.stringify({ password: 'secret123' }),
      method: 'POST',
    }));
    expect(await screen.findByRole('img', { name: /authenticator setup qr code/i })).toBeInTheDocument();
    expect(screen.getByText('backup-1')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('ABC123')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /can't scan/i }));
    expect(await screen.findByDisplayValue('ABC123')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue to verify code/i }));
    for (const [index, digit] of ['1', '2', '3', '4', '5', '6'].entries()) {
      await user.type(screen.getByLabelText(new RegExp(`digit ${index + 1}`, 'i')), digit);
    }
    await user.click(screen.getByRole('button', { name: /enable two-factor authentication/i }));

    expect(authClientMock.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: '123456' });
    expect(await screen.findByText(/two-factor authentication enabled/i)).toBeInTheDocument();
  });

  it('uses OAuth reauthentication for OAuth-only 2FA setup', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: false,
            oauthProviders: ['github'],
            primaryOAuthProvider: 'github',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<TwoFactorSetupPage />);

    expect(await screen.findByText(/confirm your github account/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue with github/i }));

    expect(authClientMock.signIn.social).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: 'http://localhost:3000/',
    });
    expect(sessionStorage.getItem('arkivra.pendingSensitiveAction')).toBe('two-factor-setup');
  });

  it('warns before replacing an existing authenticator', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: [],
            primaryOAuthProvider: null,
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<TwoFactorSetupPage />, {
      initialEntries: ['/two-factor/setup?mode=replace'],
      routePath: '/two-factor/setup',
    });

    expect(await screen.findByRole('heading', { name: /reconnect authenticator/i })).toBeInTheDocument();
    expect(screen.getByText(/previous authenticator app will stop working/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /authenticator setup qr code/i })).not.toBeInTheDocument();
  });

  it('accepts backup codes on the verification page', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<TwoFactorVerifyPage />);

    expect(screen.getByRole('checkbox', { name: /trust this device for 30 days/i })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /backup code/i }));
    await user.type(screen.getByLabelText(/backup code/i), 'backup-1');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => {
      expect(authClientMock.twoFactor.verifyBackupCode).toHaveBeenCalledWith({
        code: 'backup-1',
        trustDevice: false,
      });
    });
  });

  it('accepts authenticator codes in segmented inputs on the verification page', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<TwoFactorVerifyPage />);

    for (const [index, digit] of ['1', '2', '3', '4', '5', '6'].entries()) {
      await user.type(screen.getByLabelText(new RegExp(`digit ${index + 1}`, 'i')), digit);
    }
    await user.click(screen.getByRole('checkbox', { name: /trust this device for 30 days/i }));
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => {
      expect(authClientMock.twoFactor.verifyTotp).toHaveBeenCalledWith({
        code: '123456',
        trustDevice: true,
      });
    });
  });
});

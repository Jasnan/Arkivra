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

describe('auth pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await renderWithProviders(<TwoFactorSetupPage />);

    await user.type(screen.getByLabelText(/current password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /generate setup key/i }));

    expect(authClientMock.twoFactor.enable).toHaveBeenCalledWith({ password: 'secret123' });
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('backup-1')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/enter authenticator code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and enable/i }));

    expect(authClientMock.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: '123456' });
    expect(await screen.findByText(/two-factor authentication is enabled/i)).toBeInTheDocument();
  });

  it('accepts backup codes on the verification page', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<TwoFactorVerifyPage />);

    await user.click(screen.getByRole('button', { name: /backup code/i }));
    await user.type(screen.getByLabelText(/backup code/i), 'backup-1');
    await user.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => {
      expect(authClientMock.twoFactor.verifyBackupCode).toHaveBeenCalledWith({
        code: 'backup-1',
        trustDevice: true,
      });
    });
  });
});

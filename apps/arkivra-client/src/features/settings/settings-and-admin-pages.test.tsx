import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecuritySettingsPage } from '@/features/settings/pages/security-settings-page';
import { SettingsPage } from '@/features/settings/pages/settings-page';
import { TwoFactorManagementPage } from '@/features/settings/pages/two-factor-management-page';
import { renderWithProviders } from '@/test/utils';

const authClientMock = vi.hoisted(() => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        name: 'Alex',
        email: 'alex@example.com',
        emailVerified: true,
        twoFactorEnabled: true,
      },
    },
    isPending: false,
  })),
  updateUser: vi.fn(),
  changeEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  changePassword: vi.fn(),
  signIn: {
    social: vi.fn(),
  },
  twoFactor: {
    verifyTotp: vi.fn(),
  },
  signOut: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: authClientMock,
}));function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}function installLocalStorageMock() {
  const store = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
    },
  });

  return store;
}

describe('settings and security pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    installLocalStorageMock();
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          name: 'Alex',
          email: 'alex@example.com',
          emailVerified: true,
          twoFactorEnabled: true,
        },
      },
      isPending: false,
    });
    authClientMock.updateUser.mockResolvedValue({ error: null });
    authClientMock.changeEmail.mockResolvedValue({ error: null });
    authClientMock.sendVerificationEmail.mockResolvedValue({ error: null });
    authClientMock.changePassword.mockResolvedValue({ error: null });
    authClientMock.signIn.social.mockResolvedValue({ error: null });
    authClientMock.twoFactor.verifyTotp.mockResolvedValue({ error: null });
    authClientMock.signOut.mockResolvedValue({ error: null });
    authClientMock.listSessions.mockResolvedValue({
      data: [
        {
          id: 'ses_1',
          token: 'tok_current',
          userAgent: 'Chrome on macOS',
          ipAddress: '127.0.0.1',
          createdAt: '2026-05-15T09:00:00.000Z',
          updatedAt: '2026-05-15T09:10:00.000Z',
        },
      ],
      error: null,
    });
    authClientMock.revokeSession.mockResolvedValue({ error: null });
    authClientMock.revokeOtherSessions.mockResolvedValue({ error: null });
  });

  it('updates account profile and keeps security controls off the account page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
          authMethods: {
            hasPassword: true,
            oauthProviders: ['github'],
            primaryOAuthProvider: 'github',
          },
        });
      }

      if (url === '/api/security/password/set' && init?.method === 'POST') {
        return jsonResponse({ status: true });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^edit name$/i }));
    const nameInput = await screen.findByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Alex Rivers');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(authClientMock.updateUser).toHaveBeenCalledWith({
      name: 'Alex Rivers',
    });

    expect(screen.getByText(/email changes are managed from security/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /account details/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view as admin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/local \+ github/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^sessions$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^verified$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /change password/i })).not.toBeInTheDocument();
    expect(authClientMock.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('sends verification email from the security page for unverified accounts', async () => {
    const user = userEvent.setup();
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          name: 'Alex',
          email: 'alex@example.com',
          emailVerified: false,
          twoFactorEnabled: true,
        },
      },
      isPending: false,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />);

    await user.click(await screen.findByRole('button', { name: /verify now/i }));

    expect(authClientMock.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'alex@example.com',
      callbackURL: 'http://localhost:3000/settings/security',
    });
  });

  it('allows a regular user to access account settings without admin access', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: false,
            oauthProviders: ['google'],
            primaryOAuthProvider: 'google',
          },
        });
      }

      if (url === '/api/security/password/change' && init?.method === 'POST') {
        return jsonResponse({ status: true });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /^account$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view as admin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^member$/i)).toBeInTheDocument();
    expect(screen.getByText(/requires admin approval/i)).toBeInTheDocument();
    expect(await screen.findByText(/google oauth/i)).toBeInTheDocument();
  });

  it('allows revoking individual non-current sessions', async () => {
    const user = userEvent.setup();
    authClientMock.listSessions.mockResolvedValue({
      data: [
        {
          id: 'ses_current',
          token: 'tok_current',
          userAgent: 'Chrome on macOS',
          ipAddress: '127.0.0.1',
          createdAt: '2026-05-15T09:00:00.000Z',
          updatedAt: '2026-05-15T09:10:00.000Z',
        },
        {
          id: 'ses_other',
          token: 'tok_other',
          userAgent: 'Firefox on Windows',
          ipAddress: '10.0.0.4',
          createdAt: '2026-05-14T09:00:00.000Z',
          updatedAt: '2026-05-14T11:30:00.000Z',
        },
      ],
      error: null,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_current',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
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

    await renderWithProviders(<SecuritySettingsPage />);

    expect(await screen.findByText(/firefox on windows/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^revoke$/i }));

    expect(authClientMock.revokeSession).toHaveBeenCalledWith({ token: 'tok_other' });
  });

  it('sorts the current and most recent active sessions first', async () => {
    authClientMock.listSessions.mockResolvedValue({
      data: [
        {
          id: 'ses_older',
          token: 'tok_older',
          userAgent: 'Firefox on Windows',
          ipAddress: '10.0.0.4',
          createdAt: '2026-05-14T09:00:00.000Z',
          updatedAt: '2026-05-14T11:30:00.000Z',
          expiresAt: '2026-06-14T11:30:00.000Z',
        },
        {
          id: 'ses_recent',
          token: 'tok_recent',
          userAgent: 'Safari on iPad',
          ipAddress: '10.0.0.8',
          createdAt: '2026-05-15T09:00:00.000Z',
          updatedAt: '2026-05-15T11:30:00.000Z',
          expiresAt: '2026-06-15T11:30:00.000Z',
        },
        {
          id: 'ses_current',
          token: 'tok_current',
          userAgent: 'Chrome on macOS',
          ipAddress: '127.0.0.1',
          createdAt: '2026-05-15T08:00:00.000Z',
          updatedAt: '2026-05-15T08:30:00.000Z',
          expiresAt: '2026-06-15T08:30:00.000Z',
        },
      ],
      error: null,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_current',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
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

    await renderWithProviders(<SecuritySettingsPage />);

    expect(await screen.findByText(/safari on ipad/i)).toBeInTheDocument();

    const sessionLabels = screen.getAllByText(/session$/i);
    expect(sessionLabels.map((label) => label.textContent)).toEqual([
      'Current session',
      'Active session',
      'Active session',
    ]);

    expect(
      screen.getByText(/safari on ipad/i).compareDocumentPosition(screen.getByText(/firefox on windows/i))
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows 2FA as not enabled without the old off label', async () => {
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          name: 'Alex',
          email: 'alex@example.com',
          emailVerified: true,
          twoFactorEnabled: false,
        },
      },
      isPending: false,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />);

    expect(await screen.findByText(/^disabled$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^off$/i)).not.toBeInTheDocument();
  });

  it('sets a password inline for OAuth-only accounts', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: false,
            oauthProviders: ['github'],
            primaryOAuthProvider: 'github',
          },
        });
      }

      if (url === '/api/security/password/set' && init?.method === 'POST') {
        return jsonResponse({ status: true });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />, {
      initialEntries: ['/settings/security'],
      routePath: '/settings/security',
    });

    expect(await screen.findByRole('button', { name: /^set password$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^set password$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^set password$/i }));
    await user.type(screen.getByLabelText(/^new password$/i), 'strongpass123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'different123');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/security/password/set', expect.anything());

    await user.clear(screen.getByLabelText(/^confirm password$/i));
    await user.type(screen.getByLabelText(/^confirm password$/i), 'strongpass123');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/security/password/set', expect.objectContaining({
        body: JSON.stringify({ newPassword: 'strongpass123' }),
        credentials: 'include',
        method: 'POST',
      }));
    });
  });

  it('prompts OAuth-only users to re-confirm their provider before setting a password', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: false,
            oauthProviders: ['google'],
            primaryOAuthProvider: 'google',
          },
        });
      }

      if (url === '/api/security/password/set' && init?.method === 'POST') {
        return jsonResponse({
          error: {
            code: 'security.identity_verification_failed',
            message: 'Confirm your linked sign-in provider before setting a password.',
          },
        }, 403);
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />, {
      initialEntries: ['/settings/security'],
      routePath: '/settings/security',
    });

    await user.click(await screen.findByRole('button', { name: /^set password$/i }));
    await user.type(screen.getByLabelText(/^new password$/i), 'strongpass123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'strongpass123');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await user.click(await screen.findByRole('button', { name: /continue with google/i }));

    expect(authClientMock.signIn.social).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'http://localhost:3000/settings/security',
    });
    expect(sessionStorage.getItem('arkivra.pendingSensitiveAction')).toBe('set-password');
  });

  it('changes an existing password inline from security settings', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: ['google'],
            primaryOAuthProvider: 'google',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />, {
      initialEntries: ['/settings/security'],
      routePath: '/settings/security',
    });

    expect(await screen.findByRole('button', { name: /^change password$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^change password$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^change password$/i }));
    await user.type(screen.getByLabelText(/^current password$/i), 'oldpass123');
    await user.type(screen.getByLabelText(/^new password$/i), 'newpass123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'different123');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/security/password/change', expect.anything());

    await user.clear(screen.getByLabelText(/^confirm password$/i));
    await user.type(screen.getByLabelText(/^confirm password$/i), 'newpass123');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/security/password/change', expect.objectContaining({
        body: JSON.stringify({
          currentPassword: 'oldpass123',
          newPassword: 'newpass123',
        }),
        method: 'POST',
      }));
    });
  });

  it('requests a password-confirmed email change from security settings', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: [],
            primaryOAuthProvider: null,
          },
        });
      }

      if (url === '/api/security/email/change' && init?.method === 'POST') {
        return jsonResponse({ status: true, message: 'Confirmation email sent.' });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^change email$/i }));
    await user.type(screen.getByLabelText(/new email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/current password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^send confirmation email$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/security/email/change', expect.objectContaining({
        body: JSON.stringify({
          callbackURL: 'http://localhost:3000/settings/security',
          newEmail: 'new@example.com',
          password: 'secret123',
        }),
        method: 'POST',
      }));
    });
  });

  it('requires OAuth-only users to set a password before changing email', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: false,
            oauthProviders: ['google'],
            primaryOAuthProvider: 'google',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    authClientMock.signIn.social.mockClear();

    await renderWithProviders(<SecuritySettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^change email$/i }));

    expect(screen.getByText(/set a password before changing your arkivra email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new email/i)).toBeDisabled();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^send confirmation email$/i })).toBeDisabled();
    expect(authClientMock.signIn.social).not.toHaveBeenCalled();
  });

  it('connects an OAuth provider from security settings after password confirmation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: ['google'],
            primaryOAuthProvider: 'google',
          },
        });
      }

      if (url === '/api/security/oauth/link' && init?.method === 'POST') {
        return jsonResponse({ redirect: false, status: true });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^manage connections$/i }));
    const connectButton = await screen.findByRole('button', { name: /^connect$/i });
    await user.click(connectButton);
    await user.type(screen.getByLabelText(/current password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/security/oauth/link', expect.objectContaining({
        body: JSON.stringify({
          callbackURL: 'http://localhost:3000/settings/security',
          password: 'secret123',
          provider: 'github',
        }),
        method: 'POST',
      }));
    });
  });

  it('disconnects a connected OAuth provider when password sign-in remains available', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: ['google'],
            primaryOAuthProvider: 'google',
          },
        });
      }

      if (url === '/api/security/oauth/unlink' && init?.method === 'POST') {
        return jsonResponse({ status: true });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^manage connections$/i }));
    await user.click(await screen.findByRole('button', { name: /^disconnect$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/security/oauth/unlink', expect.objectContaining({
        body: JSON.stringify({ provider: 'google' }),
        method: 'POST',
      }));
    });
  });

  it('starts 2FA setup inline from security settings', async () => {
    const user = userEvent.setup();
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          name: 'Alex',
          email: 'alex@example.com',
          emailVerified: true,
          twoFactorEnabled: false,
        },
      },
      isPending: false,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
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

    await renderWithProviders(<SecuritySettingsPage />, {
      includeToaster: true,
      initialEntries: ['/settings/security'],
      routePath: '/settings/security',
    });

    await user.click(await screen.findByRole('button', { name: /enable 2fa/i }));
    expect(screen.queryByRole('link', { name: /enable 2fa/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^current password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByLabelText(/authenticator setup qr code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/manual setup key/i)).toHaveValue('ABC123');
    expect(screen.getByLabelText(/enter 6-digit code/i)).toBeInTheDocument();
    expect(screen.queryByText('backup-1')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/security/two-factor/setup', expect.objectContaining({
      body: JSON.stringify({ password: 'secret123' }),
      method: 'POST',
    }));

    const codeInputs = screen.getAllByRole('textbox').filter(input =>
      input.getAttribute('aria-label') !== 'Manual setup key',
    );
    await user.type(codeInputs[0], '123456');
    await user.click(screen.getByRole('button', { name: /verify and continue/i }));

    expect(authClientMock.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: '123456' });
    expect(await screen.findByText(/save your backup codes/i)).toBeInTheDocument();
    expect(screen.getByText('backup-1')).toBeInTheDocument();
    expect(screen.getByText('backup-2')).toBeInTheDocument();
    expect(screen.getAllByText(/backup codes/i).length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(await screen.findByText(/two-factor authentication enabled/i)).toBeInTheDocument();
  });

  it('renders 2FA management without exposing existing backup codes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: [],
            primaryOAuthProvider: null,
          },
          twoFactor: {
            authenticatorLinkedAt: '2026-05-10T08:24:00.000Z',
            backupCodeCount: 10,
            backupCodesUpdatedAt: '2026-05-10T08:24:00.000Z',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<TwoFactorManagementPage />);

    expect(await screen.findByRole('heading', { name: /^two-factor authentication$/i })).toBeInTheDocument();
    expect(screen.getByText(/2fa is enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/authenticator app linked/i)).toBeInTheDocument();
    expect(await screen.findByText(/10 backup codes available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate codes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view backup codes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download backup codes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /authenticator setup qr code/i })).not.toBeInTheDocument();
  });

  it('reveals backup codes only after regenerating them', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: false,
          authMethods: {
            hasPassword: true,
            oauthProviders: [],
            primaryOAuthProvider: null,
          },
          twoFactor: {
            authenticatorLinkedAt: '2026-05-10T08:24:00.000Z',
            backupCodeCount: 10,
            backupCodesUpdatedAt: '2026-05-10T08:24:00.000Z',
          },
        });
      }

      if (url === '/api/security/two-factor/backup-codes/regenerate' && init?.method === 'POST') {
        return jsonResponse({
          backupCodeCount: 2,
          backupCodes: ['NEW11-AAAAA', 'NEW22-BBBBB'],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<TwoFactorManagementPage />);

    await user.click(await screen.findByRole('button', { name: /regenerate codes/i }));
    expect(screen.getByText(/invalidate all existing backup codes/i)).toBeInTheDocument();
    expect(screen.queryByText('NEW11-AAAAA')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/current password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(fetchMock).toHaveBeenCalledWith('/api/security/two-factor/backup-codes/regenerate', expect.objectContaining({
      body: JSON.stringify({ password: 'secret123' }),
      method: 'POST',
    }));
    expect(await screen.findByText('NEW11-AAAAA')).toBeInTheDocument();
    expect(screen.getByText('NEW22-BBBBB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download codes/i })).toBeInTheDocument();
  });
});

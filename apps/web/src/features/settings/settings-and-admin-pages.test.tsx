import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAiSettingsPage,
  AdminBackupsPage,
  AdminOverviewPage,
  AdminUserAccessPage,
  AdminUsersPage,
} from '@/features/admin/pages/admin-page';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { AboutSettingsPage } from '@/features/settings/pages/about-settings-page';
import { PreferencesSettingsPage } from '@/features/settings/pages/preferences-settings-page';
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
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installLocalStorageMock() {
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

function SequentialPreferenceControls() {
  const {
    accentColor,
    fontSize,
    setAccentColor,
    setFontSize,
  } = useAccentColor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAccentColor('pink');
          setFontSize('xl');
        }}
      >
        Apply rapid preferences
      </button>
      <output aria-label="preference snapshot">
        {accentColor}:{fontSize}
      </output>
    </>
  );
}

function PreferenceSnapshot() {
  const {
    accentColor,
    fontFamily,
  } = useAccentColor();

  return (
    <output aria-label="preference source snapshot">
      {accentColor}:{fontFamily}
    </output>
  );
}

function FontPreferenceControls() {
  const {
    fontFamily,
    setFontFamily,
  } = useAccentColor();

  return (
    <>
      <button type="button" onClick={() => setFontFamily('sora')}>
        Use Sora
      </button>
      <output aria-label="font preference snapshot">
        {fontFamily}
      </output>
    </>
  );
}

function StaleServerPreferenceControls({ resolveServerPreferences }: { resolveServerPreferences: () => void }) {
  const {
    accentColor,
    fontFamily,
    setAccentColor,
    setFontFamily,
  } = useAccentColor();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAccentColor('blue');
          setFontFamily('sora');
          resolveServerPreferences();
        }}
      >
        Apply while server responds
      </button>
      <output aria-label="stale preference snapshot">
        {accentColor}:{fontFamily}
      </output>
    </>
  );
}

describe('settings, admin, and about pages', () => {
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

  it('applies and persists the selected accent color from the preferences page', async () => {
    const user = userEvent.setup();
    let preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({ preferences });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        preferences = {
          ...preferences,
          ...JSON.parse(String(init.body)),
          updatedAt: '2026-05-15T01:00:00.000Z',
        };
        return jsonResponse({ preferences });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferencesSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^blue$/i }));

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--chakra-colors-teal-solid')).toBe('#2563eb');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ accentColor: 'blue' }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').accentColor).toBe('blue');
  });

  it('applies and persists density from the preferences page', async () => {
    const user = userEvent.setup();
    let preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({ preferences });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        preferences = {
          ...preferences,
          ...JSON.parse(String(init.body)),
          updatedAt: '2026-05-15T01:00:00.000Z',
        };
        return jsonResponse({ preferences });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferencesSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /^compact$/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.density).toBe('compact');
      expect(document.documentElement.style.getPropertyValue('--arkivra-controlHeight')).toBe('2rem');
      expect(document.documentElement.style.getPropertyValue('--arkivra-listRowHeight')).toBe('3rem');
      expect(document.documentElement.style.getPropertyValue('--arkivra-listIconSize')).toBe('1.75rem');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ density: 'compact' }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').density).toBe('compact');
  });

  it('keeps rapid preference changes from reverting previous local choices', async () => {
    const user = userEvent.setup();
    let preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      dateFormat: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({ preferences });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        preferences = {
          ...preferences,
          ...JSON.parse(String(init.body)),
          updatedAt: '2026-05-15T01:00:00.000Z',
        };
        return jsonResponse({ preferences });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SequentialPreferenceControls />);

    await user.click(screen.getByRole('button', { name: /apply rapid preferences/i }));

    expect(screen.getByLabelText(/preference snapshot/i)).toHaveTextContent('pink:xl');
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).toEqual(
      expect.objectContaining({
        accentColor: 'pink',
        fontSize: 'xl',
      }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ accentColor: 'pink', fontSize: 'xl' }),
        method: 'PATCH',
      }));
    });
  });

  it('uses cached local appearance preferences instead of loading older server values', async () => {
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      themeMode: 'system',
      accentColor: 'purple',
      density: 'comfortable',
      fontFamily: 'sora',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
    }));
    const fetchMock = vi.fn(async () => jsonResponse({
      preferences: {
        themeMode: 'system',
        accentColor: 'teal',
        density: 'comfortable',
        fontFamily: 'inter',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferenceSnapshot />);

    expect(screen.getByLabelText(/preference source snapshot/i)).toHaveTextContent('purple:sora');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('normalizes legacy local font keys into the current preferences cache', async () => {
    window.localStorage.setItem('arkivra.fontFamily', 'manrope');
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'manrope',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
    }));
    const fetchMock = vi.fn(async () => jsonResponse({
      preferences: {
        themeMode: 'system',
        accentColor: 'purple',
        density: 'comfortable',
        fontFamily: 'inter',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferenceSnapshot />);

    expect(screen.getByLabelText(/preference source snapshot/i)).toHaveTextContent('teal:sora');
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).toEqual(
        expect.objectContaining({ fontFamily: 'sora' }),
      );
    });
    expect(window.localStorage.getItem('arkivra.fontFamily')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('hydrates appearance preferences from the server only when local storage is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({
          preferences: {
            themeMode: 'system',
            accentColor: 'pink',
            density: 'comfortable',
            fontFamily: 'sora',
            fontSize: 'md',
            radius: 'md',
            language: 'en',
            createdAt: '2026-05-15T00:00:00.000Z',
            updatedAt: '2026-05-15T00:00:00.000Z',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferenceSnapshot />);

    await waitFor(() => {
      expect(screen.getByLabelText(/preference source snapshot/i)).toHaveTextContent('pink:sora');
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).toEqual(
      expect.objectContaining({
        accentColor: 'pink',
        fontFamily: 'sora',
      }),
    );
  });

  it('does not roll back local appearance preferences when server sync fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({
          preferences: {
            themeMode: 'system',
            accentColor: 'teal',
            density: 'comfortable',
            fontFamily: 'inter',
            fontSize: 'md',
            radius: 'md',
            language: 'en',
            createdAt: '2026-05-15T00:00:00.000Z',
            updatedAt: '2026-05-15T00:00:00.000Z',
          },
        });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        return jsonResponse({ error: { code: 'test.failure', message: 'Nope.' } }, 500);
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<FontPreferenceControls />);

    await waitFor(() => {
      expect(screen.getByLabelText(/font preference snapshot/i)).toHaveTextContent('inter');
    });

    await user.click(screen.getByRole('button', { name: /use sora/i }));

    expect(screen.getByLabelText(/font preference snapshot/i)).toHaveTextContent('sora');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ fontFamily: 'sora' }),
        method: 'PATCH',
      }));
    });
    expect(screen.getByLabelText(/font preference snapshot/i)).toHaveTextContent('sora');
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).toEqual(
      expect.objectContaining({
        fontFamily: 'sora',
      }),
    );
  });

  it('ignores stale server preferences that arrive during a local change', async () => {
    const user = userEvent.setup();
    const stalePreferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    let resolveServerPreferences: () => void = () => undefined;
    const serverPreferencesPromise = new Promise<Response>((resolve) => {
      resolveServerPreferences = () => resolve(jsonResponse({ preferences: stalePreferences }));
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return serverPreferencesPromise;
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        return jsonResponse({
          preferences: {
            ...stalePreferences,
            ...JSON.parse(String(init.body)),
            updatedAt: '2026-05-15T01:00:00.000Z',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(
      <StaleServerPreferenceControls resolveServerPreferences={resolveServerPreferences} />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        credentials: 'include',
      }));
    });

    await user.click(screen.getByRole('button', { name: /apply while server responds/i }));

    expect(screen.getByLabelText(/stale preference snapshot/i)).toHaveTextContent('blue:sora');
    await waitFor(() => {
      expect(screen.getByLabelText(/stale preference snapshot/i)).toHaveTextContent('blue:sora');
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).toEqual(
      expect.objectContaining({
        accentColor: 'blue',
        fontFamily: 'sora',
      }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ accentColor: 'blue', fontFamily: 'sora' }),
        method: 'PATCH',
      }));
    });
  });

  it('applies and persists regional preferences', async () => {
    const user = userEvent.setup();
    let preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({ preferences });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        preferences = {
          ...preferences,
          ...JSON.parse(String(init.body)),
          updatedAt: '2026-05-15T01:00:00.000Z',
        };
        return jsonResponse({ preferences });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferencesSettingsPage />);

    await user.click(screen.getByRole('button', { name: /language/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /german/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ language: 'de' }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').language).toBe('de');

    await user.click(screen.getByRole('button', { name: /date format/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /DD\.MM\.YYYY/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ dateFormat: 'DD.MM.YYYY' }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').dateFormat).toBe('DD.MM.YYYY');

    await user.click(screen.getByRole('button', { name: /date format/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /automatic/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ dateFormat: null }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').dateFormat).toBeNull();
  });

  it('applies and persists the default project view preference', async () => {
    const user = userEvent.setup();
    let preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      showExtractedTextTab: false,
      defaultFileBrowserView: 'list',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({ preferences });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        preferences = {
          ...preferences,
          ...JSON.parse(String(init.body)),
          updatedAt: '2026-05-15T01:00:00.000Z',
        };
        return jsonResponse({ preferences });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferencesSettingsPage />);

    await user.click(screen.getByRole('button', { name: /default view/i }));
    await user.click(await screen.findByRole('menuitemradio', { name: /grid/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ defaultFileBrowserView: 'grid' }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').defaultFileBrowserView).toBe('grid');
  });

  it('applies and persists the extracted text tab preference', async () => {
    const user = userEvent.setup();
    let preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      showExtractedTextTab: false,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me/preferences' && (!init || init.method === undefined)) {
        return jsonResponse({ preferences });
      }

      if (url === '/api/me/preferences' && init?.method === 'PATCH') {
        preferences = {
          ...preferences,
          ...JSON.parse(String(init.body)),
          updatedAt: '2026-05-15T01:00:00.000Z',
        };
        return jsonResponse({ preferences });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<PreferencesSettingsPage />);

    await user.click(await screen.findByRole('checkbox', { name: /show extracted text tab/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ showExtractedTextTab: true }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').showExtractedTextTab).toBe(true);
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

  it('loads admin data and triggers backup and user actions', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/permission-requests?status=pending') {
        return jsonResponse({
          requests: [
            {
              id: 'req_1',
              type: 'vault.create',
              status: 'pending',
              requestedBy: 'usr_1',
              reviewedBy: null,
              reviewedAt: null,
              vaultId: null,
              targetUserId: null,
              payload: { name: 'Requests Vault' },
              result: null,
              createdAt: '2026-04-14T19:00:00.000Z',
              updatedAt: '2026-04-14T19:00:00.000Z',
            },
          ],
        });
      }

      if (url === '/api/admin/backups' && (!init || init.method === undefined)) {
        return jsonResponse({
          backups: [
            {
              id: 'arkivra-backup-1.tar.gz',
              fileName: 'arkivra-backup-1.tar.gz',
              size: 1024,
              createdAt: '2026-04-14T18:00:00.000Z',
            },
          ],
        });
      }

      if (url === '/api/admin/backups' && init?.method === 'POST') {
        return jsonResponse({ jobId: 'job_backup_1' }, 202);
      }

      if (url === '/api/admin/backups/restore' && init?.method === 'POST') {
        return jsonResponse({ jobId: 'job_restore_1' }, 202);
      }

      if (url === '/api/admin/users' && (!init || init.method === undefined)) {
        return jsonResponse({
          users: [
            {
              id: 'usr_1',
              email: 'alex@example.com',
              name: 'Alex',
              emailVerified: true,
              twoFactorEnabled: true,
              disabledAt: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              systemRole: 'member',
              systemCapabilities: [],
              isAdmin: false,
              canCreateVault: false,
              authMethods: {
                hasPassword: true,
                oauthProviders: ['google'],
                primaryOAuthProvider: 'google',
              },
            },
          ],
        });
      }

      if (url === '/api/admin/users/usr_1' && init?.method === 'PATCH') {
        return jsonResponse({
          user: {
            id: 'usr_1',
            email: 'alex@example.com',
            name: 'Alex',
            emailVerified: true,
            twoFactorEnabled: true,
            disabledAt: '2026-04-14T19:00:00.000Z',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-14T19:00:00.000Z',
            systemRole: 'member',
            systemCapabilities: [],
            isAdmin: false,
            canCreateVault: false,
            authMethods: {
              hasPassword: true,
              oauthProviders: ['google'],
              primaryOAuthProvider: 'google',
            },
          },
        });
      }

      if (url === '/api/admin/users/usr_1/admin' && init?.method === 'POST') {
        return jsonResponse({
          user: {
            id: 'usr_1',
            email: 'alex@example.com',
            name: 'Alex',
            emailVerified: true,
            twoFactorEnabled: true,
            disabledAt: null,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-14T19:00:00.000Z',
            systemRole: 'admin',
            systemCapabilities: ['system.create_vaults'],
            isAdmin: true,
            canCreateVault: true,
            authMethods: {
              hasPassword: true,
              oauthProviders: ['google'],
              primaryOAuthProvider: 'google',
            },
          },
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'gemma4:e4b',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: 'bge-m3',
              dimensions: 1024,
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: true,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: 'gemma4:e4b',
            },
            embedding: {
              semanticSearchAvailable: true,
              activeIndex: {
                id: 'eix_active',
                providerConfigId: 'aip_embedding',
                provider: 'ollama',
                model: 'bge-m3',
                dimensions: 1024,
                distanceMetric: 'cosine',
                status: 'active',
                isActive: true,
                expectedChunkCount: 10,
                embeddedChunkCount: 10,
                failedChunkCount: 0,
                failureMessage: null,
                buildStartedAt: '2026-04-14T18:00:00.000Z',
                buildCompletedAt: '2026-04-14T18:05:00.000Z',
                activatedAt: '2026-04-14T18:06:00.000Z',
                createdAt: '2026-04-14T18:00:00.000Z',
                updatedAt: '2026-04-14T18:06:00.000Z',
                documentStatuses: {
                  pending: 0,
                  indexing: 0,
                  ready: 2,
                  failed: 0,
                  stale: 0,
                  skipped: 0,
                },
              },
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 10,
                totalChunkCount: 10,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/settings' && init?.method === 'PUT') {
        return jsonResponse({
          settings: JSON.parse(String(init.body)),
        });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        return jsonResponse({
          models: [
            {
              name: 'gemma4:e4b',
              size: 1024,
              modifiedAt: '2026-04-14T19:00:00.000Z',
            },
            {
              name: 'qwen2.5:7b',
              size: 2048,
              modifiedAt: '2026-04-14T19:30:00.000Z',
            },
          ],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        return jsonResponse({
          availability: {
            host: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
            reachable: true,
            modelAvailable: true,
            models: [
              {
                name: 'gemma4:e4b',
                size: 1024,
                modifiedAt: '2026-04-14T19:00:00.000Z',
              },
            ],
            responseTimeMs: 42,
            error: null,
          },
        });
      }

      if (url === '/api/admin/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Invoices Vault',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              ownerUserId: 'usr_owner',
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner',
              memberCount: 3,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let view = await renderWithProviders(<AdminOverviewPage />);
    expect(await screen.findByText(/1 vault/i)).toBeInTheDocument();
    expect(await screen.findByText(/invoices vault/i)).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/3 members/i)).toBeInTheDocument();
    view.unmount();

    view = await renderWithProviders(<AdminBackupsPage />);
    expect(await screen.findByText(/arkivra-backup-1.tar.gz/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/backups',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/backups/restore',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      );
    });
    view.unmount();

    view = await renderWithProviders(<AdminUsersPage />);
    expect(await screen.findByText(/alex@example.com/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /user actions for alex@example.com/i }));
    expect(screen.getByRole('menuitem', { name: /access/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /resend invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /view activity/i })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /deactivate user/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/usr_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'PATCH',
        }),
      );
    });
    view.unmount();

    await renderWithProviders(<AdminAiSettingsPage />);
    expect(await screen.findByText('The index enables semantic search across your documents.')).toBeInTheDocument();
    await user.click(screen.getByLabelText(/enable ai features/i));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai/settings',
        expect.objectContaining({
          credentials: 'include',
          method: 'PUT',
        }),
      );
    });
  });

  it('opens a compact invite dialog focused on identity and system permissions', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/users') {
        return jsonResponse({
          users: [
            {
              id: 'usr_1',
              email: 'alex@example.com',
              name: 'Alex',
              emailVerified: true,
              twoFactorEnabled: true,
              disabledAt: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              systemRole: 'member',
              systemCapabilities: [],
              isAdmin: false,
              canCreateVault: false,
              authMethods: {
                hasPassword: true,
                oauthProviders: ['google'],
                primaryOAuthProvider: 'google',
              },
            },
          ],
        });
      }

      if (url === '/api/admin/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Invoices Vault',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              ownerUserId: 'usr_owner',
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner',
              memberCount: 3,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /^invite$/i }));

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /system role/i })).toBeInTheDocument();
    expect(screen.getAllByText(/can create vaults/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/the user will receive an email invitation to create their account/i)).toBeInTheDocument();
    expect(screen.queryByText(/invitation flow/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /user information/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /system permissions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /optional starter access/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/starter vault/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/add another vault/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai features/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the invited user will receive an email with instructions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no ai access/i)).not.toBeInTheDocument();
  });

  it('allows saving chat provider settings while AI features are disabled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            aiFeaturesEnabled: false,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKeySecretRef: null,
              model: '',
            },
            embedding: {
              provider: 'ollama',
              baseUrl: '',
              apiKeySecretRef: null,
              model: '',
              dimensions: 1024,
            },
            ollamaHost: 'http://127.0.0.1:11434',
            model: '',
          },
        });
      }

      if (url === '/api/admin/ai/status') {
        return jsonResponse({
          status: {
            aiFeaturesEnabled: false,
            chat: {
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              model: '',
            },
            embedding: {
              semanticSearchAvailable: false,
              activeIndex: null,
              candidateIndexes: [],
              recentIndexes: [],
              chunkCoverage: {
                indexedChunkCount: 0,
                totalChunkCount: 0,
              },
            },
          },
        });
      }

      if (url === '/api/admin/ai/models' && init?.method === 'POST') {
        return jsonResponse({
          models: [
            {
              name: 'gemma4:e4b',
              size: 1024,
              modifiedAt: '2026-04-14T19:00:00.000Z',
            },
          ],
        });
      }

      if (url === '/api/admin/ai/availability' && init?.method === 'POST') {
        return jsonResponse({
          availability: {
            host: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
            reachable: true,
            modelAvailable: true,
            models: [{ name: 'gemma4:e4b', size: 1024, modifiedAt: '2026-04-14T19:00:00.000Z' }],
            responseTimeMs: 42,
            error: null,
          },
        });
      }

      if (url === '/api/admin/ai/settings' && init?.method === 'PUT') {
        return jsonResponse({ settings: JSON.parse(String(init.body)) });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminAiSettingsPage />);

    expect((await screen.findAllByText('gemma4:e4b')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /view details/i }));
    const [chatBaseUrlInput] = await screen.findAllByLabelText(/base url/i);
    await user.clear(chatBaseUrlInput);
    await user.type(chatBaseUrlInput, 'http://127.0.0.1:11435');
    await user.tab();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai/settings',
        expect.objectContaining({
          credentials: 'include',
          method: 'PUT',
        }),
      );
    });
  });

  it('renders detailed user access management outside the invite modal', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_admin',
          sessionId: 'ses_admin',
          systemRole: 'admin',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: true,
          canCreateVault: true,
        });
      }

      if (url === '/api/admin/users') {
        return jsonResponse({
          users: [
            {
              id: 'usr_1',
              email: 'alex@example.com',
              name: 'Alex',
              emailVerified: true,
              twoFactorEnabled: true,
              disabledAt: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              systemRole: 'member',
              systemCapabilities: [],
              isAdmin: false,
              canCreateVault: false,
              authMethods: {
                hasPassword: true,
                oauthProviders: ['google'],
                primaryOAuthProvider: 'google',
              },
            },
          ],
        });
      }

      if (url === '/api/admin/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Invoices Vault',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              ownerUserId: 'usr_owner',
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner',
              memberCount: 3,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminUserAccessPage />, {
      initialEntries: ['/admin/users/usr_1/access'],
      routePath: '/admin/users/:userId/access',
    });

    expect(await screen.findByRole('heading', { name: /user access/i })).toBeInTheDocument();
    expect(screen.getByText(/alex@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/vault permission matrices, AI feature permissions/i)).toBeInTheDocument();
    expect(screen.getByText(/Invoices Vault/i)).toBeInTheDocument();
  });

  it('shows app metadata and project links on the settings about page', async () => {
    await renderWithProviders(<AboutSettingsPage />);

    expect((await screen.findAllByText('0.1.0')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /website/i })).toHaveAttribute('href', 'https://arkivra.app');
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute('href', 'https://docs.arkivra.app');
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute('href', 'https://github.com/Jasnan/Arkivra');
    expect(screen.getByRole('link', { name: /license/i })).toHaveAttribute('href', 'https://github.com/Jasnan/arkivra/blob/main/LICENSE');
    expect(screen.getByRole('link', { name: /jasnan thachaparamban/i })).toHaveAttribute('href', 'https://jasnan.xyz');
    expect(screen.getByLabelText(/arkivra is crafted with ❤️ by/i)).toBeInTheDocument();
    expect(screen.queryByText(/project direction/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/system information/i)).not.toBeInTheDocument();
  });
});

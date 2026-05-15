import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from '@/features/admin/pages/admin-page';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
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
          setFontFamily('manrope');
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
    installLocalStorageMock().set('arkivra.accentColor', 'teal');
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: true,
          canCreateVault: true,
          authMethods: {
            hasPassword: true,
            oauthProviders: ['github'],
            primaryOAuthProvider: 'github',
          },
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SettingsPage />);

    const nameInput = await screen.findByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Alex Rivers');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(authClientMock.updateUser).toHaveBeenCalledWith({
      name: 'Alex Rivers',
    });

    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByText(/email changes are managed from security/i)).toBeInTheDocument();
    expect(screen.getByText(/account status/i)).toBeInTheDocument();
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
          isGlobalAdmin: true,
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          isGlobalAdmin: false,
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

    await renderWithProviders(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /^account$/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view as admin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/member access/i)).toBeInTheDocument();
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
          isGlobalAdmin: false,
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

  it('requests a password-confirmed email change from security settings', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          isGlobalAdmin: false,
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

    await user.click(await screen.findByRole('button', { name: /change email/i }));
    await user.type(screen.getByLabelText(/new email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/current password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /request change/i }));

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

  it('applies and persists the selected accent color from the theme panel', async () => {
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

    await renderWithProviders(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /open appearance panel/i }));
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

  it('applies and persists density from the theme panel', async () => {
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

    await renderWithProviders(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /open appearance panel/i }));
    await user.click(await screen.findByRole('button', { name: /^compact$/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.density).toBe('compact');
      expect(document.documentElement.style.getPropertyValue('--arkivra-controlHeight')).toBe('2rem');
      expect(document.documentElement.style.getPropertyValue('--arkivra-listRowHeight')).toBe('3.5rem');
      expect(document.documentElement.style.getPropertyValue('--arkivra-listIconSize')).toBe('2rem');
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
      timezone: 'auto',
      dateFormat: 'medium',
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
      timezone: 'auto',
      dateFormat: 'medium',
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

    expect(screen.getByLabelText(/stale preference snapshot/i)).toHaveTextContent('blue:manrope');
    await waitFor(() => {
      expect(screen.getByLabelText(/stale preference snapshot/i)).toHaveTextContent('blue:manrope');
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).toEqual(
      expect.objectContaining({
        accentColor: 'blue',
        fontFamily: 'manrope',
      }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ accentColor: 'blue', fontFamily: 'manrope' }),
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
      timezone: 'auto',
      dateFormat: 'medium',
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
  });

  it('links to the dedicated 2FA management page from settings', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          isGlobalAdmin: false,
          canCreateVault: false,
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SecuritySettingsPage />);

    expect(await screen.findByRole('link', { name: /manage 2fa/i })).toHaveAttribute(
      'href',
      '/two-factor/manage',
    );
  });

  it('renders 2FA management without exposing existing backup codes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          isGlobalAdmin: false,
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
    expect(screen.getByRole('button', { name: /regenerate backup codes/i })).toBeInTheDocument();
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
          isGlobalAdmin: false,
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

    await user.click(await screen.findByRole('button', { name: /regenerate backup codes/i }));
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
          isGlobalAdmin: true,
          canCreateVault: true,
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
              globalRoles: [],
              isGlobalAdmin: false,
              canCreateVault: false,
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
            globalRoles: [],
            isGlobalAdmin: false,
            canCreateVault: false,
          },
        });
      }

      if (url === '/api/admin/users/usr_1/global-admin' && init?.method === 'POST') {
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
            globalRoles: ['global_admin'],
            isGlobalAdmin: true,
            canCreateVault: true,
          },
        });
      }

      if (url === '/api/admin/ai/settings' && (!init || init.method === undefined)) {
        return jsonResponse({
          settings: {
            enabled: true,
            ollamaHost: 'http://127.0.0.1:11434',
            model: 'gemma4:e4b',
            minTokenLength: 8,
            maxCandidates: 100,
            batchSize: 10,
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
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AdminPage />);

    expect(await screen.findByText(/invoices vault/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create backup/i }));
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

    await user.click(screen.getByRole('button', { name: /disable/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/usr_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'PATCH',
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: /grant admin/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/usr_1/global-admin',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      );
    });

    await user.clear(screen.getByLabelText(/ollama host/i));
    await user.type(screen.getByLabelText(/ollama host/i), 'http://192.168.1.77:11434');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
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

  it('shows app metadata and project links on the settings about page', async () => {
    await renderWithProviders(<AboutSettingsPage />);

    expect((await screen.findAllByText('0.1.0')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /website/i })).toHaveAttribute('href', 'https://arkivra.app');
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute('href', 'https://docs.arkivra.io');
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute('href', 'https://github.com/Jasnan/Arkivra');
    expect(screen.getByRole('link', { name: /license/i })).toHaveAttribute('href', 'https://github.com/Jasnan/arkivra/blob/main/LICENSE');
    expect(screen.getByRole('link', { name: /jasnan thachaparamban/i })).toHaveAttribute('href', 'https://jasnan.xyz');
    expect(screen.getByLabelText(/arkivra is developed with ❤️ by/i)).toBeInTheDocument();
    expect(screen.queryByText(/project direction/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/system information/i)).not.toBeInTheDocument();
  });
});

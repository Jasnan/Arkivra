import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { PreferencesSettingsPage } from '@/features/settings/pages/preferences-settings-page';
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

function ThemePreferenceSnapshot() {
  const { themeMode } = useAccentColor();

  return <output aria-label="theme preference snapshot">{themeMode}</output>;
}

function ThemePreferenceControls() {
  const {
    setThemeMode,
    themeMode,
  } = useAccentColor();

  return (
    <>
      <button type="button" onClick={() => setThemeMode('dark')}>
        Use dark
      </button>
      <button type="button" onClick={() => setThemeMode('light')}>
        Use light
      </button>
      <output aria-label="theme preference snapshot">{themeMode}</output>
    </>
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

describe('preferences settings page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
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

  it('offers only light and dark theme preferences', async () => {
    const preferences = {
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      dateFormat: null,
      showExtractedTextTab: false,
      defaultFileBrowserView: 'list',
      defaultChatAnswerMode: 'text',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ preferences })));

    await renderWithProviders(<PreferencesSettingsPage />);

    expect(await screen.findByRole('button', { name: /^light$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^dark$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^system$/i })).not.toBeInTheDocument();
  });

  it('normalizes legacy system theme preferences to light', async () => {
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
    }));
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      preferences: {
        themeMode: 'system',
        accentColor: 'purple',
        density: 'comfortable',
        fontFamily: 'sora',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    })));

    await renderWithProviders(<ThemePreferenceSnapshot />);

    expect(screen.getByLabelText(/theme preference snapshot/i)).toHaveTextContent('light');
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')).not.toHaveProperty('themeMode');
    expect(window.localStorage.getItem('arkivra.themeMode')).toBe('light');
  });

  it('applies selected light and dark themes locally without syncing them to the server', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      themeMode: 'light',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
    }));
    const fetchMock = vi.fn(async () => jsonResponse({ preferences: null }));
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<ThemePreferenceControls />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    await user.click(screen.getByRole('button', { name: /use dark/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/theme preference snapshot/i)).toHaveTextContent('dark');
      expect(document.documentElement).toHaveClass('dark');
      expect(document.documentElement).not.toHaveClass('light');
      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(window.localStorage.getItem('arkivra.themeMode')).toBe('dark');
    });

    await user.click(screen.getByRole('button', { name: /use light/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/theme preference snapshot/i)).toHaveTextContent('light');
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
      expect(document.documentElement.style.colorScheme).toBe('light');
      expect(window.localStorage.getItem('arkivra.themeMode')).toBe('light');
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
      method: 'PATCH',
    }));
  });

  it('keeps the sidebar theme toggle label and document theme in sync', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('arkivra.themeMode', 'dark');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ preferences: null })));

    await renderWithProviders(<ThemeToggle expanded />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /current theme: dark/i })).toHaveTextContent('Dark');
      expect(document.documentElement).toHaveClass('dark');
      expect(document.documentElement).not.toHaveClass('light');
    });

    await user.click(screen.getByRole('button', { name: /current theme: dark/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /current theme: light/i })).toHaveTextContent('Light');
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
      expect(window.localStorage.getItem('arkivra.themeMode')).toBe('light');
    });

    await user.click(screen.getByRole('button', { name: /current theme: light/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /current theme: dark/i })).toHaveTextContent('Dark');
      expect(document.documentElement).toHaveClass('dark');
      expect(document.documentElement).not.toHaveClass('light');
      expect(window.localStorage.getItem('arkivra.themeMode')).toBe('dark');
    });
  });

  it('keeps theme mode from local storage when hydrating server preferences', async () => {
    window.localStorage.setItem('arkivra.themeMode', 'dark');
    const fetchMock = vi.fn(async () => jsonResponse({
      preferences: {
        accentColor: 'pink',
        density: 'comfortable',
        fontFamily: 'sora',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        dateFormat: null,
        showExtractedTextTab: false,
        defaultFileBrowserView: 'list',
        defaultChatAnswerMode: 'text',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<ThemePreferenceSnapshot />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        credentials: 'include',
      }));
    });
    expect(screen.getByLabelText(/theme preference snapshot/i)).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem('arkivra.themeMode')).toBe('dark');
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
      expect(document.documentElement.style.getPropertyValue('--chakra-colors-teal-solid')).toBe('#1e66f5');
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

  it('applies and persists the default chat answer mode preference', async () => {
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
      defaultChatAnswerMode: 'text',
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

    await user.click(screen.getByRole('button', { name: /select answer mode/i }));
    await user.click(await screen.findByText(/cited answer/i));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/me/preferences', expect.objectContaining({
        body: JSON.stringify({ defaultChatAnswerMode: 'multimodal' }),
        method: 'PATCH',
      }));
    });
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').defaultChatAnswerMode).toBe('multimodal');
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
});

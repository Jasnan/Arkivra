import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from '@/features/admin/pages/admin-page';
import { AboutPage } from '@/features/about/pages/about-page';
import { SettingsPage } from '@/features/settings/pages/settings-page';
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

describe('settings, admin, and about pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
  });

  it('updates account profile and disables verification actions for verified emails', async () => {
    const user = userEvent.setup();
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

    await renderWithProviders(<SettingsPage />);

    const nameInput = await screen.findByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Alex Rivers');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(authClientMock.updateUser).toHaveBeenCalledWith({
      name: 'Alex Rivers',
    });

    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByText(/email changes are not supported/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^verified$/i })).toBeDisabled();
    expect(authClientMock.sendVerificationEmail).not.toHaveBeenCalled();

    expect(screen.getByRole('link', { name: /change password/i })).toHaveAttribute(
      'href',
      '/request-password-reset',
    );
  });

  it('sends verification email for unverified accounts', async () => {
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

    await renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole('button', { name: /verify now/i }));

    expect(authClientMock.sendVerificationEmail).toHaveBeenCalledWith({
      email: 'alex@example.com',
      callbackURL: 'http://localhost:3000/settings',
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
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /account settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /admin panel/i })).not.toBeInTheDocument();
    expect(screen.getByText(/member access/i)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /change password/i })).toHaveAttribute(
      'href',
      '/request-password-reset',
    );
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

    await renderWithProviders(<SettingsPage />);

    expect(await screen.findByText(/not enabled/i)).toBeInTheDocument();
    expect(screen.queryByText(/^off$/i)).not.toBeInTheDocument();
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

  it('shows instance version details on the about page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/health') {
          return jsonResponse({
            status: 'ok',
            version: '0.1.0',
            timestamp: '2026-04-14T19:00:00.000Z',
          });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );

    await renderWithProviders(<AboutPage />);

    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText(/self-hosted first/i)).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultSettingsPage } from '@/features/vaults/pages/vault-settings-page';
import { VaultsPage } from '@/features/vaults/pages/vaults-page';
import { renderWithProviders } from '@/test/utils';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('vault pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders vault links for documents and settings', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: true,
        });
      }

      expect(url).toContain('/api/vaults');
      return jsonResponse({
        vaults: [
          { id: 'vlt_1', name: 'Personal', description: 'Household records', fileCount: 3, totalSize: 6144, createdAt: '2025-01-01T00:00:00.000Z', role: 'owner' },
        ],
      });
    }));

    await renderWithProviders(<VaultsPage />);

    expect(await screen.findByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Household records')).toBeInTheDocument();
    expect(screen.getByText(/3 files/i)).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('link', { name: /personal/i }));
    const contextMenu = screen.getByRole('menu', { name: /vault actions for personal/i });
    expect(within(contextMenu).getByRole('menuitem', { name: /^open$/i })).toBeInTheDocument();
    expect(within(contextMenu).getByRole('menuitem', { name: /^settings$/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /vault actions for personal/i }));
    await user.click(screen.getByRole('menuitem', { name: /settings/i }));
  });

  it('validates and submits vault creation from the vaults modal', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: true,
        });
      }

      if (url === '/api/vaults' && (!init || init.method === undefined)) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Personal', description: 'Household records', fileCount: 3, totalSize: 6144, createdAt: '2025-01-01T00:00:00.000Z', role: 'owner' },
          ],
        });
      }

      return jsonResponse({
        vault: { id: 'vlt_new', name: 'Home Vault', description: 'Documents for home life', fileCount: 0, totalSize: 0, role: 'owner', permissions: [], isGlobalAdmin: false },
      }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<VaultsPage />);

    await user.click(await screen.findByRole('button', { name: /create vault/i }));
    const dialog = await screen.findByRole('dialog', { name: /new vault/i });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/vaults', expect.objectContaining({
      method: 'POST',
    }));

    await user.type(within(dialog).getByLabelText(/^name$/i), 'Home Vault');
    await user.type(within(dialog).getByLabelText(/description/i), 'Documents for home life');
    await user.click(within(dialog).getByRole('button', { name: /create vault/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults', expect.objectContaining({
        body: JSON.stringify({ name: 'Home Vault', description: 'Documents for home life' }),
        credentials: 'include',
        method: 'POST',
      }));
    });
  });

  it('returns focus to the create vault button after dismissing the dialog', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: true,
        });
      }

      if (url === '/api/vaults') {
        return jsonResponse({
          vaults: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<VaultsPage />);

    const createButton = await screen.findByRole('button', { name: /create vault/i });
    await user.click(createButton);
    const dialog = await screen.findByRole('dialog', { name: /new vault/i });

    await user.click(within(dialog).getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /new vault/i })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(createButton).toHaveFocus();
    });
  });

  it('hides vault creation actions for users without vault creation permission', async () => {
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

      if (url === '/api/vaults') {
        return jsonResponse({
          vaults: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<VaultsPage />);

    expect(await screen.findByText(/must grant vault creation/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create vault/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/vaults', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('loads vault settings and invites a member', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1')) {
        return jsonResponse({
          vault: {
            id: 'vlt_1',
            name: 'Personal',
            description: 'Household records',
            role: 'owner',
            permissions: [],
            isGlobalAdmin: false,
          },
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/members') && (!init || init.method === undefined)) {
        return jsonResponse({
          members: [
            {
              userId: 'usr_owner',
              role: 'owner',
              email: 'owner@example.com',
              name: 'Owner',
              permissions: [],
            },
          ],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/members') && init?.method === 'POST') {
        return jsonResponse({
          member: {
            userId: 'usr_new',
            role: 'member',
            email: 'new@example.com',
            name: 'New Member',
            permissions: ['documents.read'],
          },
        }, 201);
      }

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_owner',
          sessionId: 'ses_owner',
          isGlobalAdmin: false,
          canCreateVault: true,
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<VaultSettingsPage />, {
      initialEntries: ['/vaults/vlt_1/settings'],
      routePath: '/vaults/:vaultId/settings',
    });

    expect(await screen.findByText(/personal/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'Personal Vault');
    await user.clear(screen.getByLabelText(/description/i));
    await user.type(screen.getByLabelText(/description/i), 'Updated household records');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1', expect.objectContaining({
        body: JSON.stringify({ name: 'Personal Vault', description: 'Updated household records' }),
        credentials: 'include',
        method: 'PATCH',
      }));
    });

    await user.type(screen.getByPlaceholderText(/usr_/i), 'usr_new');
    await user.click(screen.getByRole('button', { name: /invite member/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/members', expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }));
    });
    expect(await screen.findByText(/member added to vault/i)).toBeInTheDocument();
  });
});

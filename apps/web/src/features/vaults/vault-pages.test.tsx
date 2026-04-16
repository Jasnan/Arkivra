import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateVaultPage } from '@/features/vaults/pages/create-vault-page';
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
          { id: 'vlt_1', name: 'Personal', role: 'owner' },
        ],
      });
    }));

    renderWithProviders(<VaultsPage />);

    expect(await screen.findAllByText('Personal')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /open documents/i })).toHaveAttribute('href', '/vaults/vlt_1/documents');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/vaults/vlt_1/settings');
  });

  it('validates and submits vault creation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          isGlobalAdmin: false,
          canCreateVault: true,
        });
      }

      return jsonResponse({
        vault: { id: 'vlt_new', name: 'Home Vault', role: 'owner', permissions: [], isGlobalAdmin: false },
      }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<CreateVaultPage />);

    await user.click(screen.getByRole('button', { name: /create vault/i }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/vaults', expect.anything());

    await user.type(screen.getByLabelText(/vault name/i), 'Home Vault');
    await user.click(screen.getByRole('button', { name: /create vault/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults', expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }));
    });
  });

  it('blocks create vault submission for users without vault creation permission', async () => {
    const user = userEvent.setup();
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

    renderWithProviders(<CreateVaultPage />);

    await user.type(screen.getByLabelText(/vault name/i), 'Blocked Vault');
    await user.click(screen.getByRole('button', { name: /create vault/i }));

    expect(await screen.findByText(/must grant vault creation/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/vaults', expect.anything());
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

    renderWithProviders(<VaultSettingsPage />, {
      initialEntries: ['/vaults/vlt_1/settings'],
      routePath: '/vaults/:vaultId/settings',
    });

    expect(await screen.findByText(/personal/i)).toBeInTheDocument();
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

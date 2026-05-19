import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import { DocumentsPage } from '@/features/documents/pages/documents-page';
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
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: ['system.create_vaults'],
          isRoot: false,
          canCreateVault: true,
        });
      }

      expect(url).toContain('/api/vaults');
      return jsonResponse({
        vaults: [
          { id: 'vlt_1', name: 'Personal', description: 'Household records', fileCount: 3, totalSize: 6144, createdAt: '2025-01-01T00:00:00.000Z', role: 'owner', aiAccessLevel: 'full', isRoot: false },
        ],
      });
    }));

    await renderWithProviders(<VaultsPage />);

    const createVaultButton = await screen.findByRole('button', { name: /create vault/i });
    const vaultToolbar = createVaultButton.closest('header');
    expect(vaultToolbar).not.toBeNull();
    expect(within(vaultToolbar as HTMLElement).getByRole('button', { name: 'Grid view' })).toBeInTheDocument();
    expect(within(vaultToolbar as HTMLElement).getByRole('button', { name: 'List view' })).toBeInTheDocument();
    expect(await screen.findByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Household records')).toBeInTheDocument();
    expect(screen.getByText('Access')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('6.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('link', { name: /personal/i }));
    const contextMenu = screen.getByRole('menu', { name: /vault actions for personal/i });
    expect(within(contextMenu).getByRole('menuitem', { name: /^open$/i })).toBeInTheDocument();
    expect(within(contextMenu).getByRole('menuitem', { name: /^settings$/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /vault actions for personal/i }));
    await user.click(screen.getByRole('menuitem', { name: /settings/i }));
  });

  it('uses the shared app-shell vault tree instead of overriding secondary content', async () => {
    const setHeaderConfig = vi.fn();
    const setSecondaryContent = vi.fn();

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: ['system.create_vaults'],
          isRoot: false,
          canCreateVault: true,
        });
      }

      if (url === '/api/vaults') {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Personal', description: 'Household records', fileCount: 3, totalSize: 6144, createdAt: '2025-01-01T00:00:00.000Z', role: 'owner', aiAccessLevel: 'full', isRoot: false },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(
      <WorkspaceLayoutContext value={{ setHeaderConfig, setSecondaryContent }}>
        <VaultsPage />
      </WorkspaceLayoutContext>,
    );

    expect(await screen.findByText('Personal')).toBeInTheDocument();
    expect(setSecondaryContent).toHaveBeenCalledWith(null);
    expect(setSecondaryContent.mock.calls.every(([content]) => content === null)).toBe(true);
  });

  it('validates and submits vault creation from the vaults modal', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: ['system.create_vaults'],
          isRoot: false,
          canCreateVault: true,
        });
      }

      if (url === '/api/vaults' && (!init || init.method === undefined)) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Personal', description: 'Household records', fileCount: 3, totalSize: 6144, createdAt: '2025-01-01T00:00:00.000Z', role: 'owner', aiAccessLevel: 'full', isRoot: false },
          ],
        });
      }

      return jsonResponse({
        vault: { id: 'vlt_new', name: 'Home Vault', description: 'Documents for home life', fileCount: 0, totalSize: 0, role: 'owner', aiAccessLevel: 'none', isRoot: false },
      }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<VaultsPage />);

    await user.click(await screen.findByRole('button', { name: /create vault/i }));
    const dialog = await screen.findByRole('dialog', { name: /new vault/i });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/vaults', expect.objectContaining({
      method: 'POST',
    }));

    await user.type(within(dialog).getByLabelText(/vault name/i), 'Home Vault');
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
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: ['system.create_vaults'],
          isRoot: false,
          canCreateVault: true,
        });
      }

      if (url === '/api/vaults' && (!init || init.method === undefined)) {
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

  it('queues vault creation requests for users without vault creation capability', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_member',
          sessionId: 'ses_member',
          systemRole: 'member',
          systemCapabilities: [],
          isRoot: false,
          canCreateVault: false,
        });
      }

      if (url === '/api/vaults' && init?.method === 'POST') {
        return jsonResponse({
          request: {
            id: 'req_create',
            type: 'vault.create',
            status: 'pending',
            requestedBy: 'usr_member',
            reviewedBy: null,
            reviewedAt: null,
            vaultId: null,
            targetUserId: null,
            payload: { name: 'Shared Vault', description: '' },
            result: null,
            createdAt: '2026-05-17T10:00:00.000Z',
            updatedAt: '2026-05-17T10:00:00.000Z',
          },
        }, 202);
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

    expect(await screen.findByText(/request a vault and a root can approve it/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create vault/i }));
    const dialog = await screen.findByRole('dialog', { name: /new vault/i });
    await user.type(within(dialog).getByLabelText(/vault name/i), 'Shared Vault');
    await user.click(within(dialog).getByRole('button', { name: /request vault/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults', expect.objectContaining({
        body: JSON.stringify({ name: 'Shared Vault', description: null }),
        credentials: 'include',
        method: 'POST',
      }));
    });
    expect(await screen.findByText(/vault creation request queued/i)).toBeInTheDocument();
  });

  it('loads vault settings and updates vault identity', async () => {
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
            aiAccessLevel: 'full',
            isRoot: false,
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
              aiAccessLevel: 'full',
            },
          ],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/folders/items?folderId=root')) {
        return jsonResponse({
          folder: null,
          breadcrumbs: [],
          folders: [],
          documents: [],
          items: [],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/folders/tree')) {
        return jsonResponse({ folders: [], documents: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/members') && init?.method === 'POST') {
        return jsonResponse({
          member: {
            userId: 'usr_new',
            role: 'viewer',
            email: 'new@example.com',
            name: 'New Member',
            aiAccessLevel: 'none',
          },
        }, 201);
      }

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_owner',
          sessionId: 'ses_owner',
          systemRole: 'member',
          systemCapabilities: ['system.create_vaults'],
          isRoot: false,
          canCreateVault: true,
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1?tab=settings'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByRole('tab', { name: /settings/i })).toHaveAttribute('aria-selected', 'true');
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

    expect(screen.queryByRole('button', { name: /add member/i })).not.toBeInTheDocument();
  });

  it('invites a member from the vault members tab', async () => {
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
            aiAccessLevel: 'full',
            isRoot: false,
            isMember: true,
            accessMode: 'member',
          },
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/folders/items?folderId=root')) {
        return jsonResponse({
          folder: null,
          breadcrumbs: [],
          folders: [],
          documents: [],
          items: [],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/folders/tree')) {
        return jsonResponse({ folders: [], documents: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/members') && (!init || init.method === undefined)) {
        return jsonResponse({
          members: [
            {
              userId: 'usr_owner',
              role: 'owner',
              email: 'owner@example.com',
              name: 'Owner',
              aiAccessLevel: 'full',
            },
          ],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/members') && init?.method === 'POST') {
        return jsonResponse({
          member: {
            userId: 'usr_new',
            role: 'viewer',
            email: 'new@example.com',
            name: 'New Member',
            aiAccessLevel: 'none',
          },
        }, 201);
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1?tab=members'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByRole('tab', { name: /members/i })).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByPlaceholderText(/usr_/i), 'usr_new');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/members', expect.objectContaining({
        body: JSON.stringify({ userId: 'usr_new', role: 'viewer', aiAccessLevel: 'none' }),
        credentials: 'include',
        method: 'POST',
      }));
    });
    expect(await screen.findByText(/member added to vault/i)).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/app-shell';
import { renderWithProviders } from '@/test/utils';

const authClientMock = vi.hoisted(() => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        email: 'member@example.com',
      },
    },
    isPending: false,
  })),
  signOut: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: authClientMock,
}));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('app shell account menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          email: 'member@example.com',
        },
      },
      isPending: false,
    });
    authClientMock.signOut.mockResolvedValue({ error: null });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/me') {
          return jsonResponse({
            userId: 'usr_member',
            sessionId: 'ses_member',
            isGlobalAdmin: false,
            canCreateVault: true,
          });
        }

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [
              { id: 'vlt_1', name: 'MyDocs', role: 'owner' },
              { id: 'vlt_2', name: 'MyFiles', role: 'member' },
            ],
          });
        }

        if (url === '/api/vaults/vlt_1/folders/tree') {
          return jsonResponse({
            folders: [
              { id: 'fld_1', parentId: null, name: 'Insurance', path: 'Insurance', depth: 0 },
              { id: 'fld_2', parentId: 'fld_1', name: 'Policies', path: 'Insurance/Policies', depth: 1 },
              { id: 'fld_3', parentId: 'fld_2', name: 'Claims', path: 'Insurance/Policies/Claims', depth: 2 },
              { id: 'fld_4', parentId: null, name: 'Invoices', path: 'Invoices', depth: 0 },
            ],
          });
        }

        if (url === '/api/vaults/vlt_1/documents/doc_1') {
          return jsonResponse({
            document: {
              id: 'doc_1',
              name: 'Quarterly Budget Summary.pdf',
              originalName: 'quarterly-budget-summary.pdf',
              originalSize: 2048,
              originalSha256Hash: 'abc123',
              mimeType: 'application/pdf',
              content: 'Quarterly budget summary',
              processingStatus: 'completed',
              documentDate: null,
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:05:00.000Z',
              isDeleted: false,
              deletedAt: null,
              createdBy: 'Jane Doe',
            },
          });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );
  });

  it('dismisses the account menu when clicking outside of it', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    expect(screen.getAllByRole('link', { name: /search/i })[0]).toHaveAttribute('href', '/search');

    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByText(/account settings/i)).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('keeps the primary sidebar fixed as icon-only navigation', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(primaryNav).getByRole('link', { name: 'Vaults' })).toHaveAttribute('href', '/vaults');
    expect(within(primaryNav).getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/chat');
    expect(within(primaryNav).queryByRole('link', { name: 'Trash' })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole('link', { name: 'Tags' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand sidebar/i })).not.toBeInTheDocument();
  });

  it('shows vaults under the secondary sidebar root on the vault index', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    expect(await screen.findByRole('button', { name: /create vault/i, hidden: true })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'MyDocs', hidden: true })).toHaveAttribute('href', '/vaults/vlt_1');
    expect(screen.getByRole('link', { name: 'MyFiles', hidden: true })).toHaveAttribute('href', '/vaults/vlt_2');
    expect(screen.getAllByRole('link', { name: 'Vaults', hidden: true })).toHaveLength(2);
  });

  it('keeps all vaults visible and expands the active vault tree', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    expect(await screen.findByRole('button', { name: /create vault/i, hidden: true })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'MyDocs', hidden: true })).toHaveAttribute('href', '/vaults/vlt_1');
    expect(screen.getByRole('link', { name: 'MyFiles', hidden: true })).toHaveAttribute('href', '/vaults/vlt_2');
    expect(screen.queryByRole('link', { name: 'Cloud Drive', hidden: true })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Insurance', hidden: true })).toHaveAttribute(
      'href',
      '/vaults/vlt_1?folderId=fld_1',
    );
    expect(screen.getByRole('link', { name: 'Invoices', hidden: true })).toHaveAttribute(
      'href',
      '/vaults/vlt_1?folderId=fld_4',
    );
    expect(screen.queryByRole('link', { name: 'Policies', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Claims', hidden: true })).not.toBeInTheDocument();
  });

  it('expands only the selected folder branch in the vault sidebar', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1?folderId=fld_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    expect(await screen.findByRole('link', { name: 'Insurance', hidden: true })).toHaveAttribute(
      'href',
      '/vaults/vlt_1?folderId=fld_1',
    );
    expect(screen.getByRole('link', { name: 'Invoices', hidden: true })).toHaveAttribute(
      'href',
      '/vaults/vlt_1?folderId=fld_4',
    );
    expect(screen.getByRole('link', { name: 'Policies', hidden: true })).toHaveAttribute(
      'href',
      '/vaults/vlt_1?folderId=fld_2',
    );
    expect(screen.queryByRole('link', { name: 'Claims', hidden: true })).not.toBeInTheDocument();
  });

  it('opens quick search from the trigger and Meta+K shortcut', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const quickSearchTrigger = screen.getByText('Quick search...').closest('button');
    expect(quickSearchTrigger).not.toBeNull();

    fireEvent.click(quickSearchTrigger!);
    expect(await screen.findByLabelText(/quick search modal/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close search/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/quick search modal/i)).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByLabelText(/quick search modal/i)).toBeInTheDocument();
  });

  it('shows simple breadcrumbs for top-level workspace pages', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/search'],
        routePath: '/search',
      },
    );

    const breadcrumbNav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByText('Search')).toBeInTheDocument();
    expect(within(breadcrumbNav).queryByRole('link', { name: 'MyDocs' })).not.toBeInTheDocument();
  });

  it('shows vault-scoped breadcrumbs for vault document detail pages', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1/doc_1'],
        routePath: '/vaults/:vaultId/:documentId',
      },
    );

    const breadcrumbNav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByRole('link', { name: 'Vaults' })).toHaveAttribute('href', '/vaults');
    expect(await within(breadcrumbNav).findByRole('link', { name: 'MyDocs' })).toHaveAttribute(
      'href',
      '/vaults/vlt_1',
    );
    expect(within(breadcrumbNav).queryByRole('link', { name: 'Documents' })).not.toBeInTheDocument();
    expect(await within(breadcrumbNav).findByText('Quarterly Budget Summary.pdf')).toBeInTheDocument();
  });
});

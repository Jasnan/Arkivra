import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/app-shell';
import { ROUTES } from '@/app/routes';
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

function expectHiddenLink(name: string) {
  const node = screen.queryByRole('link', { name, hidden: true })
    ?? screen.queryByRole('button', { name, hidden: true })
    ?? screen.queryByRole('treeitem', { name, hidden: true });

  if (node) expect(node as HTMLElement).not.toBeVisible();
}

async function openTreeBranch(name: string) {
  const button = await screen.findByRole('button', { name, hidden: true });

  if (button.getAttribute('data-state') === 'open') return;

  fireEvent.click(button);

  await waitFor(() => {
    expect(screen.getByRole('button', { name, hidden: true })).toHaveAttribute('data-state', 'open');
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
            documents: [
              {
                id: 'doc_1',
                name: 'Quarterly Budget Summary.pdf',
                originalName: 'quarterly-budget-summary.pdf',
                folderId: 'fld_2',
                originalSize: 2048,
                mimeType: 'application/pdf',
                processingStatus: 'completed',
                documentDate: null,
                createdAt: '2026-04-10T10:00:00.000Z',
                updatedAt: '2026-04-10T10:05:00.000Z',
                isDeleted: false,
                deletedAt: null,
                path: 'Insurance/Policies/Quarterly Budget Summary.pdf',
                depth: 2,
              },
              {
                id: 'doc_root',
                name: 'Vault Overview.pdf',
                originalName: 'vault-overview.pdf',
                folderId: null,
                originalSize: 1024,
                mimeType: 'application/pdf',
                processingStatus: 'completed',
                documentDate: null,
                createdAt: '2026-04-09T10:00:00.000Z',
                updatedAt: '2026-04-09T10:05:00.000Z',
                isDeleted: false,
                deletedAt: null,
                path: 'Vault Overview.pdf',
                depth: 0,
              },
            ],
          });
        }

        if (url === '/api/vaults/vlt_2/folders/tree') {
          return jsonResponse({
            folders: [
              { id: 'fld_cloud', parentId: null, name: 'Cloud Drive', path: 'Cloud Drive', depth: 0 },
            ],
            documents: [],
          });
        }

        if (url === '/api/vaults/vlt_1/documents/doc_1') {
          return jsonResponse({
            document: {
              id: 'doc_1',
              name: 'Quarterly Budget Summary.pdf',
              originalName: 'quarterly-budget-summary.pdf',
              folderId: 'fld_2',
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
    expect(within(primaryNav).getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags');
    expect(within(primaryNav).getByRole('link', { name: 'Trash' })).toHaveAttribute('href', '/trash');
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
    expect(screen.getByRole('button', { name: 'Vaults', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(await screen.findByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('button', { name: 'MyFiles', hidden: true })).toHaveAttribute('data-state', 'closed');
    expect(screen.getAllByText('Vaults')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Vaults', hidden: true }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Vaults', hidden: true })).toHaveAttribute('data-state', 'closed');
    });
    expectHiddenLink('MyDocs');
    expectHiddenLink('MyFiles');

    fireEvent.click(screen.getByRole('button', { name: 'Vaults', hidden: true }));
    expect(await screen.findByRole('button', { name: 'MyDocs', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MyFiles', hidden: true })).toBeInTheDocument();
  });

  it('keeps all vaults visible and lets Chakra expand the active vault tree', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    expect(await screen.findByRole('button', { name: /create vault/i, hidden: true })).toBeInTheDocument();
    const myDocsButton = await screen.findByRole('button', { name: 'MyDocs', hidden: true });
    expect(myDocsButton).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('button', { name: 'MyFiles', hidden: true })).toHaveAttribute('data-state', 'closed');
    expect(screen.queryByRole('button', { name: 'Cloud Drive', hidden: true })).not.toBeInTheDocument();

    fireEvent.click(myDocsButton);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
    });

    expect(await screen.findByRole('button', { name: 'Insurance', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Vault Overview.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'closed');
    expectHiddenLink('Policies');
    expectHiddenLink('Quarterly Budget Summary.pdf');
    expectHiddenLink('Claims');
  });

  it('uses the standard secondary sidebar on global taxonomy pages', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/tags'],
        routePath: '/tags',
      },
    );

    expect(screen.getByRole('link', { name: 'Settings', hidden: true })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'About', hidden: true })).toHaveAttribute('href', '/about');
    expect(screen.queryByRole('button', { name: 'MyDocs', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MyFiles', hidden: true })).not.toBeInTheDocument();
  });

  it('reveals nested folders after Chakra branch clicks', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1?folderId=fld_3'],
        routePath: '/vaults/:vaultId',
      },
    );

    await openTreeBranch('MyDocs');
    await openTreeBranch('Insurance');
    await openTreeBranch('Policies');

    expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('reveals the active document after Chakra branch clicks', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    await openTreeBranch('MyDocs');
    await openTreeBranch('Insurance');
    await openTreeBranch('Policies');

    expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Quarterly Budget Summary.pdf')).toBeInTheDocument();
  });

  it('expands branch clicks and retains nested expansion state', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    const vaultButton = await screen.findByRole('button', { name: 'MyDocs', hidden: true });
    expect(vaultButton).toHaveAttribute('data-state', 'closed');

    fireEvent.click(vaultButton);

    expect(await screen.findByRole('button', { name: 'Insurance', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByRole('button', { name: 'MyDocs', hidden: true }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'closed');
      expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).not.toBeVisible();
    });

    fireEvent.click(screen.getByRole('button', { name: 'MyDocs', hidden: true }));

    const insuranceButton = await screen.findByRole('button', { name: 'Insurance', hidden: true });
    expect(screen.getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(insuranceButton).toHaveAttribute('data-state', 'closed');
    expectHiddenLink('Policies');

    fireEvent.click(insuranceButton);

    expect(await screen.findByRole('button', { name: 'Policies', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'closed');
    expectHiddenLink('Claims');

    fireEvent.click(screen.getByRole('button', { name: 'Insurance', hidden: true }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'closed');
      expect(screen.getByRole('button', { name: 'Policies', hidden: true })).not.toBeVisible();
    });
    expectHiddenLink('Claims');

    fireEvent.click(screen.getByRole('button', { name: 'Insurance', hidden: true }));
    const policiesButton = await screen.findByRole('button', { name: 'Policies', hidden: true });

    fireEvent.click(policiesButton);

    expect(await screen.findByText('Claims')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByRole('button', { name: 'Policies', hidden: true }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
      expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'closed');
      expect(screen.getByText('Claims')).not.toBeVisible();
    });
  });

  it('lets collapsed vault branches toggle without route-managed expansion', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    expect(await screen.findByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('button', { name: 'MyFiles', hidden: true })).toHaveAttribute('data-state', 'closed');

    fireEvent.click(screen.getByRole('button', { name: 'MyFiles', hidden: true }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'MyFiles', hidden: true })).toHaveAttribute('data-state', 'open');
    });
    expect(screen.queryByText('Cloud Drive')).not.toBeInTheDocument();
  });

  it('remembers vault tree expansion after leaving and returning to vault routes', async () => {
    const { router } = await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePaths: ['/vaults', '/vaults/:vaultId', '/chat'],
        rootComponent: true,
      },
    );

    await openTreeBranch('MyDocs');
    await openTreeBranch('Insurance');
    expect(screen.getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');

    await router.navigate({ to: ROUTES.chat });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'MyDocs', hidden: true })).not.toBeInTheDocument();
    });

    await router.navigate({ to: ROUTES.vaults });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
      expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
    });
  });

  it('does not force nested branches open when navigating to another folder', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    await openTreeBranch('MyDocs');
    await openTreeBranch('Insurance');
    await openTreeBranch('Policies');

    expect(await screen.findByText('Claims')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByText('Invoices'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
      expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'open');
      expect(screen.getByText('Claims')).not.toBeVisible();
    });
  });

  it('reveals the current folder after navigation outside the sidebar', async () => {
    await renderWithProviders(
      <>
        <AppShell />
        <Link to={ROUTES.vaultRoot('vlt_1')} search={{ folderId: 'fld_3' } as any}>
          Open claims from pane
        </Link>
      </>,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    const insuranceButton = await screen.findByRole('button', { name: 'Insurance', hidden: true });

    await openTreeBranch('MyDocs');
    fireEvent.click(insuranceButton);
    expect(await screen.findByRole('button', { name: 'Policies', hidden: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Insurance', hidden: true }));
    expectHiddenLink('Policies');

    fireEvent.click(screen.getByRole('link', { name: 'Open claims from pane' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
      expect(screen.getByRole('button', { name: 'Policies', hidden: true })).toHaveAttribute('data-state', 'open');
      expect(screen.getByRole('treeitem', { name: 'Claims', hidden: true })).toHaveAttribute('data-selected', '');
    });
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
    expect(await within(breadcrumbNav).findByText('Quarter...')).toHaveAttribute(
      'title',
      'Quarterly Budget Summary.pdf',
    );
  });
});

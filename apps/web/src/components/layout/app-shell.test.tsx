import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/app-shell';
import { renderWithProviders } from '@/test/utils';

const authClientMock = vi.hoisted(() => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        name: '',
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
          name: '',
          email: 'member@example.com',
        },
      },
      isPending: false,
    });
    authClientMock.signOut.mockResolvedValue({ error: null });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === '/api/me') {
          return jsonResponse({
            userId: 'usr_member',
            sessionId: 'ses_member',
            systemRole: 'member',
            systemCapabilities: ['system.create_vaults'],
            isAdmin: false,
            canCreateVault: true,
            aiFeaturesEnabled: true,
          });
        }

        if (url === '/api/me/preferences') {
          return jsonResponse({
            preferences: {
              themeMode: init?.method === 'PATCH'
                ? JSON.parse(String(init.body)).themeMode ?? 'system'
                : 'system',
              accentColor: 'teal',
              density: 'comfortable',
              fontFamily: 'inter',
              fontSize: 'md',
              radius: 'md',
              language: 'en',
              timezone: 'auto',
              dateFormat: 'medium',
              defaultFileBrowserView: 'grid',
              showExtractedTextTab: true,
              createdAt: '2026-05-15T00:00:00.000Z',
              updatedAt: '2026-05-15T01:00:00.000Z',
            },
          });
        }

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [
              { id: 'vlt_1', name: 'MyDocs', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
              { id: 'vlt_2', name: 'MyFiles', role: 'viewer', aiAccessLevel: 'none', isAdmin: false },
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
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:05:00.000Z',
              isDeleted: false,
              deletedAt: null,
              createdBy: 'Jane Doe',
            },
          });
        }

        if (url.includes('/api/search?')) {
          return jsonResponse({
            query: 'invoice',
            pageIndex: 0,
            pageSize: 8,
            resultsCount: 0,
            filters: {
              vaultId: null,
              tagId: null,
              tagIds: [],
              dateFrom: null,
              dateTo: null,
              sortBy: 'created_desc',
            },
            results: [],
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
    const accountMenu = await screen.findByRole('menu');
    expect(accountMenu).toBeInTheDocument();
    expect(within(accountMenu).getByRole('menuitem', { name: /account settings/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open account menu/i }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('contracts long account labels in the sidebar trigger', async () => {
    authClientMock.useSession.mockReturnValue({
      data: {
        user: {
          name: 'member-with-a-long-name',
          email: 'member-with-a-long-name@example.com',
        },
      },
      isPending: false,
    });

    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const primarySidebar = screen.getByRole('complementary', { name: 'Primary sidebar' });

    expect(within(primarySidebar).getByText('member-with-a-l...')).toBeInTheDocument();
    expect(within(primarySidebar).queryByText('member-with-a-long-name@example.com')).not.toBeInTheDocument();
  });

  it('keeps the unified primary sidebar navigable and collapsible', async () => {
    const user = userEvent.setup();

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
    expect(within(primaryNav).getByRole('button', { name: 'Transfers' })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('link', { name: 'Trash' })).toHaveAttribute('href', '/trash');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: 'Primary sidebar' }))
        .queryByRole('button', { name: /collapse sidebar/i }),
    ).not.toBeInTheDocument();

    await user.click(within(primaryNav).getByRole('button', { name: 'Transfers' }));

    expect(await screen.findByRole('dialog', { name: 'Transfers' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Transfers' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('link', { name: 'Vaults' })).toHaveAttribute('href', '/vaults');
  });

  it('hides chat navigation when AI features are disabled', async () => {
    const defaultFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === '/api/me') {
          return jsonResponse({
            userId: 'usr_member',
            sessionId: 'ses_member',
            systemRole: 'member',
            systemCapabilities: ['system.create_vaults'],
            isAdmin: false,
            canCreateVault: true,
            aiFeaturesEnabled: false,
          });
        }

        return defaultFetch(input, init);
      }),
    );

    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(primaryNav).getByRole('link', { name: 'Vaults' })).toHaveAttribute('href', '/vaults');
    await waitFor(() => {
      expect(within(primaryNav).queryByRole('link', { name: 'Chat' })).not.toBeInTheDocument();
    });
  });

  it('uses the sidebar utility as a theme switcher', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const themeButton = screen.getByRole('button', { name: /switch theme/i });
    expect(screen.queryByRole('link', { name: /open appearance preferences/i })).not.toBeInTheDocument();

    await user.click(themeButton);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('keeps quick search as the rightmost workspace header control', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const header = screen.getByRole('banner');
    await waitFor(() => {
      expect(header.querySelector('[aria-label^="Quick search"]')).not.toBeNull();
    });

    const quickSearch = header.querySelector('[aria-label^="Quick search"]');
    const headerButtons = Array.from(header.querySelectorAll('button'));
    expect(headerButtons.at(-1)).toBe(quickSearch);
  });

  it('hides the secondary sidebar on the vault index', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    expect(screen.queryByRole('complementary', { name: 'Secondary', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/secondary sidebar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MyDocs', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MyFiles', hidden: true })).not.toBeInTheDocument();
  });

  it('renders the vault file tree inside the main content area on the vault browser route', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    const fileTree = await screen.findByRole('complementary', { name: 'Vault file tree' });
    expect(fileTree.closest('main')).not.toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Secondary', hidden: true })).not.toBeInTheDocument();
    expect(await within(fileTree).findByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(await within(fileTree).findByRole('button', { name: 'Insurance', hidden: true })).toBeInTheDocument();
    expect(screen.queryByTitle('Hide secondary sidebar')).not.toBeInTheDocument();
  });

  it('opens vault actions from the file tree root context menu', async () => {
    const user = userEvent.setup();
    const { router } = await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1'],
        routePaths: ['/vaults/:vaultId', '/vaults/:vaultId/settings'],
      },
    );

    const fileTree = await screen.findByRole('complementary', { name: 'Vault file tree' });
    const vaultRoot = await within(fileTree).findByRole('button', { name: 'MyDocs', hidden: true });

    fireEvent.contextMenu(vaultRoot, { clientX: 120, clientY: 160 });

    const menu = await screen.findByRole('menu', { name: /actions for mydocs/i });
    expect(within(menu).getByRole('menuitem', { name: /^open$/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^members$/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^activity$/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^settings$/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^chat$/i })).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: /^settings$/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vaults/vlt_1/settings');
    });
  });

  it('expands the active folder in the vault file tree on folder browser routes', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1?folderId=fld_1'],
        routePath: '/vaults/:vaultId',
      },
    );

    const fileTree = await screen.findByRole('complementary', { name: 'Vault file tree' });
    expect(await within(fileTree).findByRole('button', { name: 'Insurance', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(await within(fileTree).findByRole('button', { name: 'Policies', hidden: true })).toBeInTheDocument();
  });

  it('keeps the vault file tree available on document routes without a secondary sidebar toggle', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults/vlt_1/doc_1'],
        routePath: '/vaults/:vaultId/:documentId',
      },
    );

    const fileTree = await screen.findByRole('complementary', { name: 'Vault file tree' });
    expect(fileTree.closest('main')).not.toBeNull();
    expect(await within(fileTree).findByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(screen.queryByRole('complementary', { name: 'Secondary', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Hide secondary sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Show secondary sidebar')).not.toBeInTheDocument();
  });

  it.each([
    ['/vaults/vlt_1/members', '/vaults/:vaultId/members'],
    ['/vaults/vlt_1/activity', '/vaults/:vaultId/activity'],
    ['/vaults/vlt_1/settings', '/vaults/:vaultId/settings'],
  ])('hides the vault file tree on %s', async (initialEntry, routePath) => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: [initialEntry],
        routePath,
      },
    );

    expect(screen.queryByRole('complementary', { name: 'Vault file tree' })).not.toBeInTheDocument();
  });

  it.each([
    ['/tags', '/tags'],
    ['/trash', '/trash'],
    ['/search', '/search'],
  ])('hides the secondary sidebar on %s', async (initialEntry, routePath) => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: [initialEntry],
        routePath,
      },
    );

    expect(screen.queryByRole('complementary', { name: 'Secondary', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/secondary sidebar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MyDocs', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MyFiles', hidden: true })).not.toBeInTheDocument();
  });


  it('opens quick search from the Meta+K shortcut', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByLabelText(/quick search modal/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close search/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/quick search modal/i)).not.toBeInTheDocument();
    });
  });

  it('debounces quick search input before querying the backend', async () => {
    await renderWithProviders(
      <AppShell />,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const quickSearchInput = await screen.findByLabelText(/quick search modal/i);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();

    vi.useFakeTimers();

    try {
      fireEvent.change(quickSearchInput, { target: { value: 'invoice' } });

      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?'))).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(279);
      });
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?'))).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=8&q=invoice')
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

import { screen, waitFor, within } from '@testing-library/react';
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
            canCreateVault: false,
          });
        }

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [{ id: 'vlt_1', name: 'Puzzle Palace', role: 'owner' }],
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

    renderWithProviders(
      <AppShell>
        <div>Workspace</div>
      </AppShell>,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    expect(screen.getAllByRole('link', { name: /tags/i })[0]).toHaveAttribute('href', '/tags');

    await user.click(screen.getByRole('button', { name: /open account menu/i }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByText(/account settings/i)).toBeInTheDocument();

    await user.click(screen.getByText('Workspace'));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('collapses the desktop sidebar to icon-only navigation', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AppShell>
        <div>Workspace</div>
      </AppShell>,
      {
        initialEntries: ['/vaults'],
        routePath: '/vaults',
      },
    );

    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    const documentsLabel = within(primaryNav).getByText('All Documents');

    expect(documentsLabel).not.toHaveClass('hidden');

    await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(documentsLabel).toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'All Documents' })[0]).toHaveAttribute(
      'href',
      '/documents',
    );
  });

  it('shows global document breadcrumbs for all-documents detail pages', async () => {
    renderWithProviders(
      <AppShell>
        <div>Workspace</div>
      </AppShell>,
      {
        initialEntries: ['/documents/vlt_1/doc_1'],
        routePath: '/documents/:vaultId/:documentId',
      },
    );

    const breadcrumbNav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByRole('link', { name: 'All Documents' })).toHaveAttribute(
      'href',
      '/documents',
    );
    expect(await within(breadcrumbNav).findByText('Quarterly Budget Summary.pdf')).toBeInTheDocument();
    expect(within(breadcrumbNav).queryByRole('link', { name: 'Puzzle Palace' })).not.toBeInTheDocument();
  });

  it('shows vault-scoped breadcrumbs for vault document detail pages', async () => {
    renderWithProviders(
      <AppShell>
        <div>Workspace</div>
      </AppShell>,
      {
        initialEntries: ['/vaults/vlt_1/documents/doc_1'],
        routePath: '/vaults/:vaultId/documents/:documentId',
      },
    );

    const breadcrumbNav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumbNav).getByRole('link', { name: 'Vaults' })).toHaveAttribute('href', '/vaults');
    expect(await within(breadcrumbNav).findByRole('link', { name: 'Puzzle Palace' })).toHaveAttribute(
      'href',
      '/vaults/vlt_1/documents',
    );
    expect(within(breadcrumbNav).queryByRole('link', { name: 'Documents' })).not.toBeInTheDocument();
    expect(await within(breadcrumbNav).findByText('Quarterly Budget Summary.pdf')).toBeInTheDocument();
  });
});

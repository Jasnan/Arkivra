import { screen, waitFor } from '@testing-library/react';
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
});

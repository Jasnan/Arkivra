import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagsPage } from '@/features/tags/pages/tags-page';
import { renderWithProviders } from '@/test/utils';
import { jsonResponse } from './tags-and-documents.test-utils';

describe('tags page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates, updates, and deletes tags', async () => {
    const user = userEvent.setup();
    let tagDeleted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/vaults') {
        return jsonResponse({
          vaults: [
            {
              id: 'vlt_1',
              name: 'Personal',
              description: null,
              fileCount: 3,
              totalSize: 1024,
              createdAt: '2026-04-10T10:00:00.000Z',
              role: 'owner',
            },
          ],
        });
      }

      if (url === '/api/tags') {
        return jsonResponse({
          tags: tagDeleted
            ? []
            : [
                {
                  id: 'tag_1',
                  vaultId: 'vlt_1',
                  vaultName: 'Personal',
                  name: 'Invoices',
                  color: '#2563eb',
                  description: 'Monthly billing documents',
                  documentsCount: 2,
                  createdAt: '2026-04-10T10:00:00.000Z',
                },
              ],
        });
      }

      if (url.endsWith('/api/tags') && init?.method === 'POST') {
        return jsonResponse(
          { tag: { id: 'tag_2', name: 'Receipts', color: '#22c55e', vaultId: 'vlt_1' } },
          201,
        );
      }

      if (url.endsWith('/api/tags/tag_1') && init?.method === 'PATCH') {
        return jsonResponse({
          tag: { id: 'tag_1', name: 'Bills', color: '#2563eb', vaultId: 'vlt_1' },
        });
      }

      if (url.endsWith('/api/tags/tag_1') && init?.method === 'DELETE') {
        tagDeleted = true;
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<TagsPage />, {
      initialEntries: ['/tags'],
      routePath: '/tags',
    });

    expect(await screen.findByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText(/monthly billing documents/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new tag/i }));
    const createDialog = screen.getByRole('dialog', { name: /new tag/i });
    await user.type(within(createDialog).getByLabelText(/^name$/i), 'Receipts');
    await user.click(within(createDialog).getByRole('button', { name: /^create$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tags',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: /open actions for invoices/i }));
    const actionMenu = await screen.findByRole('menu');
    const actionEdit = within(actionMenu).getByRole('menuitem', { name: /^edit$/i });
    await user.click(actionEdit);
    const editDialog = await screen.findByRole('dialog', { name: /edit tag/i });
    const editInput = within(editDialog).getByLabelText(/^name$/i);
    await user.clear(editInput);
    await user.type(editInput, 'Bills');
    await user.click(within(editDialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tags/tag_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'PATCH',
        }),
      ),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit tag/i })).not.toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByText('Invoices'));
    const contextMenu = screen.getByRole('menu', { name: /tag actions for invoices/i });
    const contextEdit = within(contextMenu).getByRole('menuitem', { name: /^edit$/i });
    const contextDelete = within(contextMenu).getByRole('menuitem', { name: /^delete$/i });
    await user.hover(contextDelete);
    expect(contextDelete).toHaveAttribute('data-active', 'true');
    expect(contextEdit).not.toHaveAttribute('data-active');
    await user.keyboard('{Escape}');

    const actionsTrigger = screen.getByRole('button', { name: /open actions for invoices/i });
    await waitFor(() => expect(actionsTrigger).toHaveAttribute('aria-expanded', 'false'));
    await user.click(actionsTrigger);
    await user.click(await screen.findByText(/^Delete$/i));
    expect(screen.getByText(/currently attached to 2 documents/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tags/tag_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'DELETE',
        }),
      ),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /delete “invoices”\?/i }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText('Invoices')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /new tag/i }));
    expect(screen.getByRole('dialog', { name: /new tag/i })).toBeInTheDocument();
  });

  it('filters tags on the management page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [
              {
                id: 'vlt_1',
                name: 'Personal',
                description: null,
                fileCount: 3,
                totalSize: 1024,
                createdAt: '2026-04-10T10:00:00.000Z',
                role: 'owner',
                aiAccessLevel: 'full',
                isAdmin: false,
              },
            ],
          });
        }

        if (url === '/api/tags') {
          return jsonResponse({
            tags: [
              {
                id: 'tag_1',
                vaultId: 'vlt_1',
                vaultName: 'Personal',
                name: 'Invoices',
                color: '#2563eb',
                documentsCount: 2,
                createdAt: '2026-04-10T10:00:00.000Z',
              },
              {
                id: 'tag_2',
                vaultId: 'vlt_1',
                vaultName: 'Personal',
                name: 'Legal',
                color: '#22c55e',
                documentsCount: 1,
                createdAt: '2026-04-11T10:00:00.000Z',
              },
            ],
          });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );

    await renderWithProviders(<TagsPage />, {
      initialEntries: ['/tags'],
      routePath: '/tags',
    });

    expect(await screen.findByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search tags/i), 'inv');

    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.queryByText('Legal')).not.toBeInTheDocument();
  });

  it('opens accessible documents for a tag when clicking a tag document count', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [
              {
                id: 'vlt_1',
                name: 'Personal',
                description: null,
                fileCount: 3,
                totalSize: 1024,
                createdAt: '2026-04-10T10:00:00.000Z',
                role: 'owner',
                aiAccessLevel: 'full',
                isAdmin: false,
              },
            ],
          });
        }

        if (url === '/api/tags') {
          return jsonResponse({
            tags: [
              {
                id: 'tag_1',
                name: 'Invoices',
                color: '#2563eb',
                description: 'Monthly billing documents',
                documentsCount: 2,
                createdAt: '2026-04-10T10:00:00.000Z',
              },
            ],
          });
        }

        if (url === '/api/tags/tag_1/documents') {
          return jsonResponse({
            documents: [
              {
                id: 'doc_1',
                vaultId: 'vlt_1',
                vaultName: 'Personal',
                name: 'Invoice April.pdf',
                originalName: 'invoice.pdf',
                folderId: null,
                originalSize: 2048,
                mimeType: 'application/pdf',
                processingStatus: 'completed',
                createdAt: '2026-04-10T10:00:00.000Z',
                updatedAt: '2026-04-10T10:00:00.000Z',
                isDeleted: false,
                deletedAt: null,
              },
              {
                id: 'doc_2',
                vaultId: 'vlt_2',
                vaultName: 'Finance',
                name: 'Invoice May.pdf',
                originalName: 'may.pdf',
                folderId: null,
                originalSize: 4096,
                mimeType: 'application/pdf',
                processingStatus: 'queued',
                createdAt: '2026-05-10T10:00:00.000Z',
                updatedAt: '2026-05-10T10:00:00.000Z',
                isDeleted: false,
                deletedAt: null,
              },
            ],
          });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );

    await renderWithProviders(<TagsPage />, {
      initialEntries: ['/tags'],
      routes: [
        { path: '/tags' },
        { path: '/vaults/:vaultId/:documentId', component: () => <div>Document route</div> },
      ],
    });

    await user.click(
      await screen.findByRole('button', { name: /view documents tagged invoices/i }),
    );

    const dialog = await screen.findByRole('dialog', { name: /documents tagged “invoices”/i });
    expect(within(dialog).getByRole('link', { name: /open invoice april\.pdf/i })).toHaveAttribute(
      'href',
      '/vaults/vlt_1/doc_1',
    );
    expect(within(dialog).getByRole('link', { name: /open invoice may\.pdf/i })).toHaveAttribute(
      'href',
      '/vaults/vlt_2/doc_2',
    );
    expect(within(dialog).getByText('Personal')).toBeInTheDocument();
    expect(within(dialog).getByText('Finance')).toBeInTheDocument();
  });

  it('returns focus to the new tag button after dismissing the create dialog', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [
              {
                id: 'vlt_1',
                name: 'Personal',
                description: null,
                fileCount: 3,
                totalSize: 1024,
                createdAt: '2026-04-10T10:00:00.000Z',
                role: 'owner',
              },
            ],
          });
        }

        if (url === '/api/tags') {
          return jsonResponse({ tags: [] });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );

    await renderWithProviders(<TagsPage />, {
      initialEntries: ['/tags'],
      routePath: '/tags',
    });

    const createButton = await screen.findByRole('button', { name: /new tag/i });
    await user.click(createButton);
    const dialog = await screen.findByRole('dialog', { name: /new tag/i });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /new tag/i })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(createButton).toHaveFocus();
    });
  });

  it('returns focus to the tag actions trigger after closing delete confirmation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/vaults') {
          return jsonResponse({
            vaults: [
              {
                id: 'vlt_1',
                name: 'Personal',
                description: null,
                fileCount: 3,
                totalSize: 1024,
                createdAt: '2026-04-10T10:00:00.000Z',
                role: 'owner',
              },
            ],
          });
        }

        if (url === '/api/tags') {
          return jsonResponse({
            tags: [
              {
                id: 'tag_1',
                vaultId: 'vlt_1',
                vaultName: 'Personal',
                name: 'Invoices',
                color: '#2563eb',
                description: 'Monthly billing documents',
                documentsCount: 2,
                createdAt: '2026-04-10T10:00:00.000Z',
              },
            ],
          });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );

    await renderWithProviders(<TagsPage />, {
      initialEntries: ['/tags'],
      routePath: '/tags',
    });

    const actionButton = await screen.findByRole('button', { name: /open actions for invoices/i });
    await user.click(actionButton);
    await user.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    expect(await screen.findByRole('dialog', { name: /delete “invoices”\?/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /delete “invoices”\?/i }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(actionButton).toHaveFocus();
    });
  });
});

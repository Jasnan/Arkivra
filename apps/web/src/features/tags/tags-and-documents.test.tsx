import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentDetailPage } from '@/features/documents/pages/document-detail-page';
import { DocumentsPage } from '@/features/documents/pages/documents-page';
import { TagsPage } from '@/features/tags/pages/tags-page';
import { renderWithProviders } from '@/test/utils';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function folderItemsResponse(
  overrides: Partial<{
    folder: unknown;
    breadcrumbs: unknown[];
    folders: unknown[];
    documents: unknown[];
    items: unknown[];
  }> = {},
) {
  return {
    folder: null,
    breadcrumbs: [],
    folders: [],
    documents: [],
    items: [],
    ...overrides,
  };
}

async function selectRadixOption({
  user,
  trigger,
  optionName,
}: {
  user: ReturnType<typeof userEvent.setup>;
  trigger: HTMLElement;
  optionName: RegExp;
}) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('tags and documents pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates, updates, and deletes tags', async () => {
    const user = userEvent.setup();
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

      if (url.endsWith('/api/vaults/vlt_1/tags') && init?.method === 'POST') {
        return jsonResponse(
          { tag: { id: 'tag_2', name: 'Receipts', color: '#22c55e', vaultId: 'vlt_1' } },
          201,
        );
      }

      if (url.endsWith('/api/vaults/vlt_1/tags/tag_1') && init?.method === 'PATCH') {
        return jsonResponse({
          tag: { id: 'tag_1', name: 'Bills', color: '#2563eb', vaultId: 'vlt_1' },
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags/tag_1') && init?.method === 'DELETE') {
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

    await user.click(screen.getByRole('button', { name: /create tag/i }));
    const createDialog = screen.getByRole('dialog', { name: /create tag/i });
    await selectRadixOption({
      user,
      trigger: within(createDialog).getByLabelText(/^vault$/i),
      optionName: /personal/i,
    });
    await user.type(within(createDialog).getByLabelText(/^name$/i), 'Receipts');
    await user.click(within(createDialog).getByRole('button', { name: /^create tag$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/tags',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: /open actions for invoices/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));
    const editDialog = screen.getByRole('dialog', { name: /edit tag/i });
    const editInput = within(editDialog).getByLabelText(/^name$/i);
    await user.clear(editInput);
    await user.type(editInput, 'Bills');
    await user.click(within(editDialog).getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/tags/tag_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'PATCH',
        }),
      ),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit tag/i })).not.toBeInTheDocument();
    });

    const actionsTrigger = screen.getByRole('button', { name: /open actions for invoices/i });
    await waitFor(() => expect(actionsTrigger).toHaveAttribute('aria-expanded', 'false'));
    await user.click(actionsTrigger);
    await user.click(await screen.findByText(/^Delete$/i));
    expect(screen.getByText(/currently attached to 2 documents/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete tag$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/tags/tag_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'DELETE',
        }),
      ),
    );
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

  it('returns focus to the create tag button after dismissing the create dialog', async () => {
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

    const createButton = await screen.findByRole('button', { name: /create tag/i });
    await user.click(createButton);
    expect(await screen.findByRole('dialog', { name: /create tag/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /create tag/i })).not.toBeInTheDocument();
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

  it('filters the document list by tag', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/vaults/vlt_1/documents')) {
        if (url.includes('tagId=tag_1')) {
          return jsonResponse({
            documents: [
              {
                id: 'doc_1',
                name: 'Invoice April.pdf',
                originalName: 'invoice.pdf',
                originalSize: 2048,
                mimeType: 'application/pdf',
                documentDate: null,
                createdAt: '2026-04-10T10:00:00.000Z',
                updatedAt: '2026-04-10T10:00:00.000Z',
                isDeleted: false,
                deletedAt: null,
              },
            ],
          });
        }

        return jsonResponse({
          documents: [
            {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              mimeType: 'application/pdf',
              documentDate: null,
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
            {
              id: 'doc_2',
              name: 'Contract.pdf',
              originalName: 'contract.pdf',
              originalSize: 4096,
              mimeType: 'application/pdf',
              documentDate: null,
              createdAt: '2026-04-12T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(folderItemsResponse());
      }

      if (url.endsWith('/api/vaults/vlt_1/tags')) {
        return jsonResponse({
          tags: [{ id: 'tag_1', name: 'Invoices', color: '#2563eb' }],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contract/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });
    await selectRadixOption({
      user,
      trigger: screen.getByLabelText(/tag filter/i),
      optionName: /invoices/i,
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents?tagId=tag_1&sortBy=created_desc&folderId=root',
        expect.objectContaining({
          credentials: 'include',
        }),
      );
    });
    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /contract/i })).not.toBeInTheDocument();
  });

  it('supports preset and custom date filtering on the vault documents page', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/vaults/vlt_1/documents')) {
        return jsonResponse({
          documents: [
            {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              mimeType: 'application/pdf',
              documentDate: null,
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
            {
              id: 'doc_2',
              name: 'Contract.pdf',
              originalName: 'contract.pdf',
              originalSize: 4096,
              mimeType: 'application/pdf',
              documentDate: '2026-02-12T00:00:00.000Z',
              createdAt: '2026-02-12T10:00:00.000Z',
              updatedAt: '2026-02-12T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(folderItemsResponse());
      }

      if (url.endsWith('/api/vaults/vlt_1/tags')) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contract/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });

    expect(screen.getByLabelText(/any time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last 7 days/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last 30 days/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/custom range/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/custom range/i));
    await user.type(screen.getByLabelText(/^from$/i), '2026-04-01');
    await user.type(screen.getByLabelText(/^to$/i), '2026-04-30');
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /contract/i })).not.toBeInTheDocument();
  });

  it('deletes a document from the vault documents action menu', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/vaults/vlt_1/documents') && (!init || init.method === undefined)) {
        return jsonResponse({
          documents: [
            {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              mimeType: 'application/pdf',
              documentDate: null,
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(folderItemsResponse());
      }

      if (url.endsWith('/api/vaults/vlt_1/tags')) {
        return jsonResponse({ tags: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1/documents'],
      routePath: '/vaults/:vaultId/documents',
    });

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open actions for invoice april\.pdf/i }));
    await user.click(screen.getByRole('menuitem', { name: /move to trash/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents/doc_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'DELETE',
        }),
      ),
    );
  });

  it('browses folders, switches views, and creates folders on the vault documents page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/vaults/vlt_1/documents') && (!init || init.method === undefined)) {
        return jsonResponse({
          documents: url.includes('folderId=fld_1')
            ? []
            : [
                {
                  id: 'doc_1',
                  name: 'Invoice April.pdf',
                  originalName: 'invoice.pdf',
                  originalSize: 2048,
                  mimeType: 'application/pdf',
                  documentDate: null,
                  folderId: null,
                  createdAt: '2026-04-10T10:00:00.000Z',
                  updatedAt: '2026-04-10T10:00:00.000Z',
                  isDeleted: false,
                  deletedAt: null,
                },
              ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        if (url.includes('folderId=fld_1')) {
          return jsonResponse(
            folderItemsResponse({
              folder: {
                id: 'fld_1',
                vaultId: 'vlt_1',
                parentId: null,
                name: 'Finance',
                createdBy: 'user_1',
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                createdAt: '2026-04-09T10:00:00.000Z',
                updatedAt: '2026-04-09T10:00:00.000Z',
              },
              breadcrumbs: [{ id: 'fld_1', parentId: null, name: 'Finance' }],
            }),
          );
        }

        return jsonResponse(
          folderItemsResponse({
            folders: [
              {
                id: 'fld_1',
                vaultId: 'vlt_1',
                parentId: null,
                name: 'Finance',
                createdBy: 'user_1',
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                createdAt: '2026-04-09T10:00:00.000Z',
                updatedAt: '2026-04-09T10:00:00.000Z',
              },
            ],
          }),
        );
      }

      if (url.endsWith('/api/vaults/vlt_1/folders') && init?.method === 'POST') {
        expect(init.body).toBe(JSON.stringify({ parentId: 'fld_1', name: 'Projects' }));
        return jsonResponse(
          {
            folder: {
              id: 'fld_2',
              vaultId: 'vlt_1',
              parentId: 'fld_1',
              name: 'Projects',
              createdBy: 'user_1',
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              createdAt: '2026-04-12T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
            },
          },
          201,
        );
      }

      if (url.endsWith('/api/vaults/vlt_1/tags')) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByRole('button', { name: /finance/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /invoice april/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /grid view/i }));

    await user.click(screen.getByRole('button', { name: /finance/i }));

    expect(await screen.findByText(/^Finance$/)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents?sortBy=created_desc&folderId=fld_1',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    await user.click(screen.getAllByRole('button', { name: /new folder/i })[0]);
    const createDialog = await screen.findByRole('dialog', { name: /new folder/i });
    await user.type(within(createDialog).getByLabelText(/^name$/i), 'Projects');
    await user.click(within(createDialog).getByRole('button', { name: /^create folder$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/folders',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      ),
    );
  });

  it('assigns and removes tags from document detail', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'Invoice April.pdf',
            originalName: 'invoice.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            content: 'Parsed text',
            documentDate: '2026-04-10T00:00:00.000Z',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:00:00.000Z',
            isDeleted: false,
            deletedAt: null,
            createdBy: 'Jane Doe',
          },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          tags: [{ id: 'tag_1', name: 'Invoices', color: '#2563eb' }],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags')) {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb' },
            { id: 'tag_2', name: 'Urgent', color: '#ef4444' },
          ],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') && init?.method === 'POST') {
        return jsonResponse({ tag: { id: 'tag_2', name: 'Urgent', color: '#ef4444' } }, 201);
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags/tag_1') &&
        init?.method === 'DELETE'
      ) {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await screen.findByRole('tab', { name: /extracted text/i });
    await user.click(screen.getByRole('tab', { name: /extracted text/i }));
    expect(await screen.findByText(/parsed text/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add tag/i }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /urgent/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents/doc_1/tags',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: /remove invoices/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents/doc_1/tags/tag_1',
        expect.objectContaining({
          credentials: 'include',
          method: 'DELETE',
        }),
      ),
    );
  });

  it('creates a new tag from the document detail picker when it does not exist', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'Invoice April.pdf',
            originalName: 'invoice.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            content: 'Parsed text',
            documentDate: '2026-04-10T00:00:00.000Z',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:00:00.000Z',
            isDeleted: false,
            deletedAt: null,
            createdBy: 'Jane Doe',
          },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          tags: [{ id: 'tag_1', name: 'Invoices', color: '#2563eb' }],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({
          tags: [{ id: 'tag_1', name: 'Invoices', color: '#2563eb' }],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags') && init?.method === 'POST') {
        return jsonResponse(
          { tag: { id: 'tag_2', name: 'Testing', color: '#D8FF75', description: '' } },
          201,
        );
      }

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') && init?.method === 'POST') {
        return jsonResponse(
          { tag: { id: 'tag_2', name: 'Testing', color: '#D8FF75', description: '' } },
          201,
        );
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await user.click(await screen.findByRole('button', { name: /add tag/i }));
    await user.type(screen.getByPlaceholderText(/filter tags/i), 'Testing');
    await user.click(screen.getByRole('menuitem', { name: /create new tag "testing"/i }));
    expect(await screen.findByRole('heading', { name: /create tag/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^create tag$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/tags',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents/doc_1/tags',
        expect.objectContaining({
          credentials: 'include',
          method: 'POST',
        }),
      ),
    );
  });

  it('refreshes the document detail when upload extraction completes', async () => {
    const user = userEvent.setup();
    let documentFetchCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        documentFetchCount += 1;

        if (documentFetchCount === 1) {
          return jsonResponse({
            document: {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              originalSha256Hash: 'abc123',
              mimeType: 'application/pdf',
              content: '',
              processingStatus: 'pending',
              documentDate: '2026-04-10T00:00:00.000Z',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
              createdBy: 'Jane Doe',
            },
          });
        }

        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'Invoice April.pdf',
            originalName: 'invoice.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            content: 'Parsed text',
            processingStatus: 'completed',
            documentDate: '2026-04-10T00:00:00.000Z',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:05:00.000Z',
            isDeleted: false,
            deletedAt: null,
            createdBy: 'Jane Doe',
          },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({ tags: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await screen.findByRole('tab', { name: /preview/i });
    await user.click(screen.getByRole('tab', { name: /extracted text/i }));
    expect(await screen.findByText(/^Pending$/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/the document detail view polls the backend while processing is in progress/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/this document is waiting to be handed to the worker/i),
    ).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent('arkivra:uploads-completed', {
        detail: { vaultId: 'vlt_1', documentId: 'doc_1' },
      }),
    );

    expect(await screen.findByText(/processed/i)).toBeInTheDocument();
    expect(await screen.findByText('Parsed text')).toBeInTheDocument();
    expect(documentFetchCount).toBeGreaterThanOrEqual(2);
  });

  it('prefers polished displayContent over raw content on the document detail page', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'Certificate.pdf',
            originalName: 'certificate.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            content: 'FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA',
            displayContent: 'FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA',
            processingStatus: 'completed',
            documentDate: '2026-04-10T00:00:00.000Z',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:05:00.000Z',
            isDeleted: false,
            deletedAt: null,
            createdBy: 'Jane Doe',
          },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({ tags: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await screen.findByRole('tab', { name: /preview/i });
    await user.click(screen.getByRole('tab', { name: /extracted text/i }));

    expect(
      await screen.findByText('FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA'),
    ).not.toBeInTheDocument();
  });

  it('shows document chat as a tab and removes the legacy action item', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'Invoice April.pdf',
            originalName: 'invoice.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            content: 'Parsed text',
            documentDate: '2026-04-10T00:00:00.000Z',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:00:00.000Z',
            isDeleted: false,
            deletedAt: null,
            createdBy: 'Jane Doe',
          },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({ tags: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/chats') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({ conversations: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await screen.findByRole('tab', { name: /preview/i });

    await user.click(screen.getByRole('button', { name: /open actions for invoice april\.pdf/i }));
    expect(screen.queryByRole('menuitem', { name: /chat with document/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^chat$/i }));

    expect(await screen.findByText(/context: invoice april\.pdf/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /ask anything about this document/i })).toBeInTheDocument();
    expect(await screen.findByText(/no conversations yet/i)).toBeInTheDocument();
  });
});

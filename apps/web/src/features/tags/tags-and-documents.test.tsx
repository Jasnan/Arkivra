import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  const folders = overrides.folders ?? [];
  const documents = overrides.documents ?? [];

  return {
    folder: null,
    breadcrumbs: [],
    folders,
    documents,
    items: overrides.items ?? [
      ...folders.map((folder) => ({ type: 'folder', folder })),
      ...documents.map((document) => ({ type: 'document', document })),
    ],
    ...overrides,
  };
}

function vaultDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    vault: {
      id: 'vlt_1',
      name: 'Personal',
      description: null,
      fileCount: 1,
      totalSize: 2048,
      createdAt: '2026-04-10T10:00:00.000Z',
      role: 'owner',
      aiAccessLevel: 'full',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
      ...overrides,
    },
  };
}

function documentSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc_1',
    name: 'Invoice April.pdf',
    originalName: 'invoice.pdf',
    originalSize: 2048,
    mimeType: 'application/pdf',
    folderId: null,
    createdAt: '2026-04-10T10:00:00.000Z',
    updatedAt: '2026-04-10T10:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

function enableExtractedTextPreference() {
  const preferences = JSON.stringify({
    themeMode: 'system',
    accentColor: 'teal',
    density: 'comfortable',
    fontFamily: 'inter',
    fontSize: 'md',
    radius: 'md',
    language: 'en',
    showExtractedTextTab: true,
  });

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => key === 'arkivra.uiPreferences' ? preferences : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  });
}

describe('tags and documents pages', () => {
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
      expect(screen.queryByRole('dialog', { name: /delete “invoices”\?/i })).not.toBeInTheDocument();
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

  it('renders the vault browser without document-library search filters', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse(vaultDetailResponse());
      }

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
              createdAt: '2026-04-12T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(
          folderItemsResponse({
            documents: [
              documentSummary(),
              documentSummary({
                id: 'doc_2',
                name: 'Contract.pdf',
                originalName: 'contract.pdf',
                originalSize: 4096,
                createdAt: '2026-04-12T10:00:00.000Z',
                updatedAt: '2026-04-12T10:00:00.000Z',
              }),
            ],
          }),
        );
      }

      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          tags: [{ id: 'tag_1', name: 'Invoices', color: '#2563eb' }],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contract/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/search documents/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^filter$/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/vaults/vlt_1/documents?tagId='),
      expect.anything(),
    );
  });

  it('keeps date filtering out of the vault browser surface', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse(vaultDetailResponse());
      }

      if (url.includes('/api/vaults/vlt_1/documents')) {
        return jsonResponse({
          documents: [
            {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              mimeType: 'application/pdf',
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
              createdAt: '2026-02-12T10:00:00.000Z',
              updatedAt: '2026-02-12T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(
          folderItemsResponse({
            documents: [
              documentSummary(),
              documentSummary({
                id: 'doc_2',
                name: 'Contract.pdf',
                originalName: 'contract.pdf',
                originalSize: 4096,
                createdAt: '2026-02-12T10:00:00.000Z',
                updatedAt: '2026-02-12T10:00:00.000Z',
              }),
            ],
          }),
        );
      }

      if (url.endsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contract/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/any time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/custom range/i)).not.toBeInTheDocument();
  });

  it('deletes a document from the vault documents action menu', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse(vaultDetailResponse());
      }

      if (url.includes('/api/vaults/vlt_1/documents') && (!init || init.method === undefined)) {
        return jsonResponse({
          documents: [
            {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              mimeType: 'application/pdf',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          ],
        });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(folderItemsResponse({ documents: [documentSummary()] }));
      }

      if (url.endsWith('/api/tags')) {
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

    screen.getByRole('button', { name: /open actions for invoice april\.pdf/i }).focus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: /^trash$/i }));
    await user.click(await screen.findByRole('button', { name: /^trash$/i }));

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

  it('reopens the document context menu after dismissing a dialog action', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse(vaultDetailResponse());
      }

      if (url.includes('/api/vaults/vlt_1/documents') && (!init || init.method === undefined)) {
        return jsonResponse({
          documents: [
            {
              id: 'doc_1',
              name: 'Invoice April.pdf',
              originalName: 'invoice.pdf',
              originalSize: 2048,
              mimeType: 'application/pdf',
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
        return jsonResponse(folderItemsResponse({ documents: [documentSummary()] }));
      }

      if (url.endsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1/documents'],
      routePath: '/vaults/:vaultId/documents',
    });

    const documentLink = await screen.findByRole('link', { name: /invoice april/i });
    fireEvent.contextMenu(documentLink);
    await user.click(screen.getByRole('menuitem', { name: /^rename$/i }));

    const renameDialog = await screen.findByRole('dialog', { name: /rename document/i });
    await user.click(within(renameDialog).getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /rename document/i })).not.toBeInTheDocument();
    });

    fireEvent.contextMenu(documentLink);
    expect(screen.getByRole('menu', { name: /actions for invoice april\.pdf/i })).toBeInTheDocument();
  });

  it('opens root folder actions from the vault root breadcrumb context menu', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse(vaultDetailResponse());
      }

      if (url.includes('/api/vaults/vlt_1/documents') && (!init || init.method === undefined)) {
        return jsonResponse({ documents: [] });
      }

      if (url.includes('/api/vaults/vlt_1/folders/items')) {
        return jsonResponse(folderItemsResponse());
      }

      if (url.endsWith('/api/vaults/vlt_1/folders') && init?.method === 'POST') {
        expect(init.body).toBe(JSON.stringify({ parentId: null, name: 'Root Projects' }));
        return jsonResponse(
          {
            folder: {
              id: 'fld_root_project',
              vaultId: 'vlt_1',
              parentId: null,
              name: 'Root Projects',
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

      if (url.endsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    fireEvent.contextMenu(await screen.findByText(/^Personal$/));
    const menu = screen.getByRole('menu', { name: /actions for vault root/i });
    expect(within(menu).getByRole('menuitem', { name: /new folder/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^upload$/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /upload folder/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /info/i })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /rename/i })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: /new folder/i }));
    const createDialog = await screen.findByRole('dialog', { name: /new folder/i });
    await user.type(within(createDialog).getByLabelText(/^name$/i), 'Root Projects');
    await user.click(within(createDialog).getByRole('button', { name: /^create$/i }));

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

  it('browses folders, switches views, and creates folders on the vault documents page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse(vaultDetailResponse());
      }

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
            documents: [documentSummary()],
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

      if (url.endsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByRole('button', { name: /open folder finance/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /invoice april/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /grid view/i }));

    await user.click(screen.getByRole('button', { name: /open folder finance/i }));

    expect(await screen.findByText(/^Finance$/)).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/folders/items?folderId=fld_1',
        expect.objectContaining({ credentials: 'include' }),
      ),
    );

    await user.click(screen.getAllByRole('button', { name: /new folder/i })[0]);
    const createDialog = await screen.findByRole('dialog', { name: /new folder/i });
    await user.type(within(createDialog).getByLabelText(/^name$/i), 'Projects');
    await user.click(within(createDialog).getByRole('button', { name: /^create$/i }));

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
        url.endsWith('/api/vaults/vlt_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse(vaultDetailResponse());
      }

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

      if (url.endsWith('/api/tags')) {
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

    await renderWithProviders(<DocumentDetailPage section="metadata" />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await screen.findByRole('heading', { name: /invoice april/i });
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
        url.endsWith('/api/vaults/vlt_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse(vaultDetailResponse());
      }

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

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({
          tags: [{ id: 'tag_1', name: 'Invoices', color: '#2563eb' }],
        });
      }

      if (url.endsWith('/api/tags') && init?.method === 'POST') {
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

    await renderWithProviders(<DocumentDetailPage section="metadata" />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    await screen.findByRole('heading', { name: /invoice april/i });
    await user.click(await screen.findByRole('button', { name: /add tag/i }));
    await user.type(screen.getByPlaceholderText(/filter tags/i), 'Testing');
    await user.click(screen.getByRole('menuitem', { name: /new tag "testing"/i }));
    expect(await screen.findByRole('heading', { name: /new tag/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tags',
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
    let documentFetchCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse(vaultDetailResponse());
      }

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

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    enableExtractedTextPreference();

    await renderWithProviders(<DocumentDetailPage section="content" />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    expect(await screen.findByText(/^Pending$/i)).toBeInTheDocument();
    expect(
      await screen.findAllByText(/this document is waiting to be handed to the worker/i),
    ).toHaveLength(2);

    window.dispatchEvent(
      new CustomEvent('arkivra:uploads-completed', {
        detail: { vaultId: 'vlt_1', documentId: 'doc_1' },
      }),
    );

    expect(await screen.findByText('Parsed text')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/^Processed$/i)).not.toBeInTheDocument();
    });
    expect(documentFetchCount).toBeGreaterThanOrEqual(2);
  });

  it('prefers polished displayContent over raw content on the document detail page', async () => {
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

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    enableExtractedTextPreference();

    await renderWithProviders(<DocumentDetailPage section="content" />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    expect(
      await screen.findByText('FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA'),
    ).not.toBeInTheDocument();
  });

  it('renders Markdown documents as formatted previews', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1/file')) {
        return new Response([
          '# Markdown Title',
          '',
          '- First item',
          '- Second item',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| Status | Ready |',
          '',
          '```ts',
          'const preview = true;',
          '```',
        ].join('\n'), {
          headers: { 'content-type': 'text/markdown' },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'README.md',
            originalName: 'README.md',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'text/markdown',
            content: 'Markdown Title\nFirst item\nSecond item',
            processingStatus: 'completed',
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

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Markdown Title' })).toBeInTheDocument();
    expect(screen.queryByText('# Markdown Title')).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Ready' })).toBeInTheDocument();
    expect(screen.getByText('const preview = true;')).toBeInTheDocument();
  });

  it('shows the unified document chat entry point and removes the legacy action item', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse(vaultDetailResponse());
      }

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

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    await screen.findByRole('heading', { name: /invoice april/i });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    await user.click(screen.getByRole('button', { name: /open actions for invoice april\.pdf/i }));
    expect(screen.queryByRole('menuitem', { name: /chat with document/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^chat$/i })).toBeInTheDocument();
  });

  it('hides the unified document chat entry point when vault chat access is not granted', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url.endsWith('/api/vaults/vlt_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse(vaultDetailResponse({ aiAccessLevel: 'none' }));
      }

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

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    await screen.findByRole('heading', { name: /invoice april/i });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    await user.click(screen.getByRole('button', { name: /open actions for invoice april\.pdf/i }));
    expect(screen.queryByRole('menuitem', { name: /chat with document/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^chat$/i })).not.toBeInTheDocument();
  });
});

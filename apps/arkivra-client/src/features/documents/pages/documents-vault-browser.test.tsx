import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsPage } from '@/features/documents/pages/documents-page';
import { renderWithProviders } from '@/test/utils';
import { documentSummary, folderItemsResponse, jsonResponse, vaultDetailResponse } from '@/features/tags/tags-and-documents.test-utils';

describe('vault documents browser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    expect(
      screen.getByRole('menu', { name: /actions for invoice april\.pdf/i }),
    ).toBeInTheDocument();
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
});

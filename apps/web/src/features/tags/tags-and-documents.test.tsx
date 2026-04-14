import { screen, waitFor } from '@testing-library/react';
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

describe('tags and documents pages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates, updates, and deletes tags', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb', documentsCount: 2 },
          ],
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags') && init?.method === 'POST') {
        return jsonResponse({ tag: { id: 'tag_2', name: 'Receipts', color: '#22c55e' } }, 201);
      }

      if (url.endsWith('/api/vaults/vlt_1/tags/tag_1') && init?.method === 'PATCH') {
        return jsonResponse({ tag: { id: 'tag_1', name: 'Bills', color: '#2563eb' } });
      }

      if (url.endsWith('/api/vaults/vlt_1/tags/tag_1') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<TagsPage />, {
      initialEntries: ['/vaults/vlt_1/tags'],
      routePath: '/vaults/:vaultId/tags',
    });

    expect(await screen.findByDisplayValue('Invoices')).toBeInTheDocument();
    expect(screen.getByText(/used by 2 documents/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name$/i), 'Receipts');
    await user.click(screen.getByRole('button', { name: /create tag/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/tags', expect.objectContaining({
      credentials: 'include',
      method: 'POST',
    })));

    const editInput = screen.getByLabelText(/tag name for invoices/i);
    await user.clear(editInput);
    await user.type(editInput, 'Bills');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/tags/tag_1', expect.objectContaining({
      credentials: 'include',
      method: 'PATCH',
    })));

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/tags/tag_1', expect.objectContaining({
      credentials: 'include',
      method: 'DELETE',
    })));
  });

  it('filters tags on the management page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb', documentsCount: 2 },
            { id: 'tag_2', name: 'Legal', color: '#22c55e', documentsCount: 1 },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    renderWithProviders(<TagsPage />, {
      initialEntries: ['/vaults/vlt_1/tags'],
      routePath: '/vaults/:vaultId/tags',
    });

    expect(await screen.findByDisplayValue('Invoices')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Legal')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/filter tags/i), 'inv');

    expect(screen.getByDisplayValue('Invoices')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Legal')).not.toBeInTheDocument();
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

      if (url.endsWith('/api/vaults/vlt_1/tags')) {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb' },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1/documents'],
      routePath: '/vaults/:vaultId/documents',
    });

    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.getByText(/contract/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/tag filter/i), 'tag_1');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/documents?tagId=tag_1', expect.objectContaining({
        credentials: 'include',
      }));
    });
    expect(await screen.findByText(/invoice april/i)).toBeInTheDocument();
    expect(screen.queryByText(/contract/i)).not.toBeInTheDocument();
  });

  it('assigns and removes tags from document detail', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1') && (!init || init.method === undefined)) {
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
            createdBy: 'usr_1',
          },
        });
      }

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') && (!init || init.method === undefined)) {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb' },
          ],
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

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags/tag_1') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    expect(await screen.findByText(/parsed text/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/select a tag/i), 'tag_2');
    await user.click(screen.getByRole('button', { name: /assign tag/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/documents/doc_1/tags', expect.objectContaining({
      credentials: 'include',
      method: 'POST',
    })));

    await user.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/documents/doc_1/tags/tag_1', expect.objectContaining({
      credentials: 'include',
      method: 'DELETE',
    })));
  });
});

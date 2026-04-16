import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllDocumentsPage } from '@/features/documents/pages/all-documents-page';
import { renderWithProviders } from '@/test/utils';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('documents library search controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders backend search results with highlighted snippets', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner' },
          ],
        });
      }

      if (url.startsWith('/api/tags')) {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb', vaultId: 'vlt_1', vaultName: 'Sherlock' },
          ],
        });
      }

      if (url.includes('/api/search?') && url.includes('q=arkivra')) {
        return jsonResponse({
          query: 'arkivra',
          pageIndex: 0,
          pageSize: 100,
          resultsCount: 1,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'document_date_desc',
          },
          results: [
            {
              vaultId: 'vlt_1',
              vaultName: 'Sherlock',
              documentId: 'doc_1',
              name: 'Receipt for Groceries.txt',
              originalName: 'Receipt for Groceries.txt',
              originalSize: 49000,
              mimeType: 'text/plain',
              documentDate: '2026-04-10T00:00:00.000Z',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 2,
              bestChunk: {
                chunkIndex: 0,
                chunkType: 'section',
                pageNumber: 1,
                content: 'Arkivra invoice clause text',
                snippet: '<mark>Arkivra</mark> invoice clause text',
                score: 0.8,
              },
            },
          ],
        });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: '',
          pageIndex: 0,
          pageSize: 100,
          resultsCount: 0,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'document_date_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.type(screen.getByLabelText(/search documents/i), 'arkivra');

    expect(await screen.findByText(/receipt for groceries\.txt/i)).toBeInTheDocument();
    expect(screen.getByText('Arkivra', { selector: 'mark' })).toBeInTheDocument();
  });

  it('sends vault, tag, date, and sort filters to the backend', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner' },
          ],
        });
      }

      if (url === '/api/tags' || url === '/api/tags?vaultId=vlt_1') {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb', vaultId: 'vlt_1', vaultName: 'Sherlock' },
          ],
        });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'invoice',
          pageIndex: 0,
          pageSize: 100,
          resultsCount: 0,
          filters: {
            vaultId: 'vlt_1',
            tagId: 'tag_1',
            tagIds: ['tag_1'],
            dateFrom: '2026-04-01T00:00:00.000Z',
            dateTo: '2026-04-30T23:59:59.999Z',
            sortBy: 'name_asc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.type(screen.getByLabelText(/search documents/i), 'invoice');
    await screen.findByRole('option', { name: 'Sherlock' });
    await user.selectOptions(screen.getByLabelText(/vault filter/i), 'vlt_1');

    await user.click(screen.getByRole('button', { name: /select tags/i }));
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /date/i }));
    await user.type(screen.getByLabelText(/from/i), '2026-04-01');
    await user.type(screen.getByLabelText(/to/i), '2026-04-30');
    await user.click(screen.getByRole('button', { name: /apply/i }));

    await user.selectOptions(screen.getByLabelText(/sort documents/i), 'name_asc');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/search?pageIndex=0&pageSize=100&q=invoice&vaultId=vlt_1&tagIds=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc'),
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});

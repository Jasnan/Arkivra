import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPage } from '@/features/search/pages/search-page';
import { renderWithProviders } from '@/test/utils';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('search page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows instant search results with snippet highlights', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Invoices Vault', role: 'owner' },
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

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'arkivra',
          pageIndex: 0,
          pageSize: 10,
          resultsCount: 1,
          filters: {
            vaultId: null,
            tagId: null,
            dateFrom: null,
            dateTo: null,
          },
          results: [
            {
              vaultId: 'vlt_1',
              vaultName: 'Invoices Vault',
              documentId: 'doc_1',
              name: 'invoice.pdf',
              originalName: 'invoice.pdf',
              mimeType: 'application/pdf',
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

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<SearchPage />, {
      initialEntries: ['/search'],
      routePath: '/search',
    });

    await user.type(screen.getByLabelText(/search text/i), 'arkivra');

    expect(await screen.findByText(/invoice\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText('Arkivra', { selector: 'mark' })).toBeInTheDocument();
  });

  it('passes tag and date filters to the search request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Invoices Vault', role: 'owner' },
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

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'invoice',
          pageIndex: 0,
          pageSize: 10,
          resultsCount: 0,
          filters: {
            vaultId: 'vlt_1',
            tagId: 'tag_1',
            dateFrom: '2026-04-01T00:00:00.000Z',
            dateTo: '2026-04-30T23:59:59.999Z',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=invoice'],
      routePath: '/search',
    });

    await screen.findByRole('option', { name: 'Invoices Vault' });
    await user.selectOptions(screen.getByLabelText(/vault scope/i), 'vlt_1');
    await screen.findByRole('option', { name: 'Invoices' });
    await user.selectOptions(screen.getByLabelText(/tag filter/i), 'tag_1');
    await user.type(screen.getByLabelText(/date from/i), '2026-04-01');
    await user.type(screen.getByLabelText(/date to/i), '2026-04-30');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/search?q=invoice&pageIndex=0&pageSize=10&vaultId=vlt_1&tagId=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30'),
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});

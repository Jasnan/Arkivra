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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
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

  it('renders title-only search matches without OCR snippets', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner' },
          ],
        });
      }

      if (url.startsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?') && url.includes('q=contract')) {
        return jsonResponse({
          query: 'contract',
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
              documentId: 'doc_2',
              name: 'Employment Contract.pdf',
              originalName: 'employment-contract.pdf',
              originalSize: 42000,
              mimeType: 'application/pdf',
              documentDate: null,
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 1,
              bestChunk: null,
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
    }));

    renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.type(screen.getByLabelText(/search documents/i), 'contract');

    expect(await screen.findByText(/employment contract\.pdf/i)).toBeInTheDocument();
  });

  it('sends vault, tag, date, and sort filters to the backend', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
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
    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });
    await user.click(screen.getByRole('button', { name: /vault filter/i }));
    await user.type(screen.getByLabelText(/search vaults/i), 'sher');
    await user.click(screen.getByRole('option', { name: /sherlock/i }));
    await user.click(screen.getByRole('button', { name: /tag filter/i }));
    await user.click(screen.getByRole('option', { name: /invoices/i }));
    await user.click(screen.getByLabelText(/custom range/i));
    await user.type(screen.getByLabelText(/^from$/i), '2026-04-01');
    await user.type(screen.getByLabelText(/^to$/i), '2026-04-30');

    await user.selectOptions(screen.getByLabelText(/sort documents/i), 'name_asc');

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=100&q=invoice&vaultIds=vlt_1&tagIds=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc')
          && (init as RequestInit | undefined)?.credentials === 'include'
        ),
      ).toBe(true);
    });
  });

  it('keeps vault group order stable when document sorting changes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner' },
            { id: 'vlt_2', name: 'Puzzle Palace', role: 'editor' },
          ],
        });
      }

      if (url.startsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: '',
          pageIndex: 0,
          pageSize: 100,
          resultsCount: 2,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'name_desc',
          },
          results: [
            {
              vaultId: 'vlt_2',
              vaultName: 'Puzzle Palace',
              documentId: 'doc_2',
              name: 'Zulu.pdf',
              originalName: 'Zulu.pdf',
              originalSize: 42000,
              mimeType: 'application/pdf',
              documentDate: '2026-04-11T00:00:00.000Z',
              createdAt: '2026-04-11T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 0,
              bestChunk: null,
            },
            {
              vaultId: 'vlt_1',
              vaultName: 'Sherlock',
              documentId: 'doc_1',
              name: 'Alpha.pdf',
              originalName: 'Alpha.pdf',
              originalSize: 41000,
              mimeType: 'application/pdf',
              documentDate: '2026-04-10T00:00:00.000Z',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-11T10:00:00.000Z',
              matchedChunksCount: 0,
              bestChunk: null,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.selectOptions(screen.getByLabelText(/sort documents/i), 'name_desc');

    expect(await screen.findByText('Sherlock')).toBeInTheDocument();
    expect(screen.getByText('Puzzle Palace')).toBeInTheDocument();

    const vaultHeadings = screen.getAllByRole('button', { expanded: true }).map(node => node.textContent ?? '');
    const sherlockIndex = vaultHeadings.findIndex(text => text.includes('Sherlock'));
    const puzzlePalaceIndex = vaultHeadings.findIndex(text => text.includes('Puzzle Palace'));

    expect(sherlockIndex).toBeGreaterThanOrEqual(0);
    expect(puzzlePalaceIndex).toBeGreaterThanOrEqual(0);
    expect(sherlockIndex).toBeLessThan(puzzlePalaceIndex);
  });

  it('keeps custom date ranges valid in the global documents filters', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner' },
          ],
        });
      }

      if (url.startsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
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
    }));

    renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });
    await user.click(screen.getByLabelText(/custom range/i));

    const fromInput = screen.getByLabelText(/^from$/i);
    const toInput = screen.getByLabelText(/^to$/i);

    await user.type(fromInput, '2026-04-19');
    await user.type(toInput, '2026-04-18');

    expect(fromInput).toHaveValue('2026-04-18');
    expect(toInput).toHaveValue('2026-04-18');
  });
});

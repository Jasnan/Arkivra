import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { AllDocumentsPage } from '@/features/documents/pages/all-documents-page';
import { SearchPage } from '@/features/search/pages/search-page';
import { renderWithProviders } from '@/test/utils';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function selectRadixOption(user: ReturnType<typeof userEvent.setup>, triggerName: RegExp, optionName: RegExp) {
  await user.click(screen.getByRole('button', { name: triggerName }));
  await user.click(await screen.findByRole('menuitemradio', { name: optionName }));
}

function WorkspaceHeaderHarness({ children }: { children: ReactNode }) {
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);

  return (
    <WorkspaceLayoutContext value={{ setHeaderConfig, setSecondaryContent: vi.fn() }}>
      <div data-testid="app-shell-header">{headerConfig?.content}</div>
      {children}
    </WorkspaceLayoutContext>
  );
}

describe('global search page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('moves the search controls into the workspace shell header', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url === '/api/tags') {
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'invoice',
          pageIndex: 0,
          pageSize: 25,
          resultsCount: 0,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(
      <WorkspaceHeaderHarness>
        <SearchPage />
      </WorkspaceHeaderHarness>,
      {
        initialEntries: ['/search?q=invoice'],
        routePath: '/search',
      },
    );

    const shellHeader = screen.getByTestId('app-shell-header');
    expect(await screen.findAllByLabelText(/search documents/i)).toHaveLength(1);
    expect(within(shellHeader).getByText('Search')).toBeInTheDocument();
    expect(within(shellHeader).getByLabelText(/search documents/i)).toHaveValue('invoice');
    expect(within(shellHeader).getByText(/semantic search/i)).toBeInTheDocument();
  });

  it('uses the migrated search and filter controls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url === '/api/tags') {
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
          pageSize: 25,
          resultsCount: 0,
          filters: {
            vaultId: 'vlt_1',
            tagId: 'tag_1',
            tagIds: [],
            dateFrom: '2026-04-01',
            dateTo: '2026-04-30',
            sortBy: 'name_asc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=invoice&vaultId=vlt_1&tagId=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc'],
      routePath: '/search',
    });

    expect(screen.getByLabelText(/search documents/i)).toHaveValue('invoice');
    expect(await screen.findByText('Sherlock')).toBeInTheDocument();
    expect(await screen.findByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText(/1 Apr 2026 - 30 Apr 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sort/i })).toHaveTextContent(/a → z/i);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=25&q=invoice&vaultIds=vlt_1&tagIds=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc&searchMode=hybrid')
          && (init as RequestInit | undefined)?.credentials === 'include'
        ),
      ).toBe(true);
    });
  });

  it('carries search context into document result links', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url === '/api/tags') {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb', vaultId: 'vlt_1', vaultName: 'Sherlock' },
          ],
        });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'invoice',
          pageIndex: 2,
          pageSize: 25,
          resultsCount: 21,
          filters: {
            vaultId: 'vlt_1',
            tagId: 'tag_1',
            tagIds: [],
            dateFrom: '2026-04-01',
            dateTo: '2026-04-30',
            sortBy: 'name_asc',
          },
          results: [
            {
              vaultId: 'vlt_1',
              vaultName: 'Sherlock',
              documentId: 'doc_1',
              name: 'Invoice.pdf',
              originalName: 'Invoice.pdf',
              originalSize: 42000,
              mimeType: 'application/pdf',
              documentDate: '2026-04-10T00:00:00.000Z',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 0,
              bestChunk: null,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=invoice&vaultId=vlt_1&tagId=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc&pageIndex=2'],
      routePath: '/search',
    });

    expect(await screen.findByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Vault')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    expect(screen.getByText('Invoice', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByText(/matched by document title or metadata/i)).not.toBeInTheDocument();

    const resultLink = await screen.findByRole('link', { name: /^open invoice\.pdf$/i });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const href = resultLink.getAttribute('href');
    expect(href).not.toBeNull();

    const resultUrl = new URL(href!, 'http://localhost');
    expect(resultUrl.pathname).toBe('/vaults/vlt_1/doc_1');
    expect(resultUrl.searchParams.get('source')).toBe('search');
    expect(resultUrl.searchParams.get('q')).toBe('invoice');
    expect(resultUrl.searchParams.get('vaultIds')).toBe('vlt_1');
    expect(resultUrl.searchParams.get('tagIds')).toBe('tag_1');
    expect(resultUrl.searchParams.get('dateFrom')).toBe('2026-04-01');
    expect(resultUrl.searchParams.get('dateTo')).toBe('2026-04-30');
    expect(resultUrl.searchParams.get('sortBy')).toBe('name_asc');
    expect(resultUrl.searchParams.has('pageIndex')).toBe(false);
  });

  it('renders grid results as filename-only cards', async () => {
    const user = userEvent.setup();

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Finance', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url === '/api/tags') {
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'invoice',
          pageIndex: 0,
          pageSize: 25,
          resultsCount: 1,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'created_desc',
          },
          results: [
            {
              vaultId: 'vlt_1',
              vaultName: 'Finance',
              documentId: 'doc_1',
              name: 'Invoice.pdf',
              originalName: 'Invoice.pdf',
              originalSize: 42000,
              mimeType: 'application/pdf',
              documentDate: '2026-04-10T00:00:00.000Z',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 0,
              bestChunk: null,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=invoice'],
      routePath: '/search',
    });

    await user.click(screen.getByRole('button', { name: /grid view/i }));

    const resultLink = await screen.findByRole('link', { name: /^open invoice\.pdf$/i });
    const resultUrl = new URL(resultLink.getAttribute('href')!, 'http://localhost');
    expect(resultUrl.pathname).toBe('/vaults/vlt_1/doc_1');
    expect(resultUrl.searchParams.get('source')).toBe('search');
    expect(resultUrl.searchParams.get('q')).toBe('invoice');
    expect(resultUrl.searchParams.get('sortBy')).toBe('created_desc');
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.queryByText('Invoice.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    expect(screen.queryByText('Size')).not.toBeInTheDocument();
  });

  it('debounces search input before querying the backend', async () => {
    vi.useFakeTimers();

    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/api/vaults')) {
          return jsonResponse({ vaults: [] });
        }

        if (url === '/api/tags') {
          return jsonResponse({ tags: [] });
        }

        if (url.includes('/api/search?')) {
          return jsonResponse({
            query: 'invoice',
            pageIndex: 0,
            pageSize: 25,
            resultsCount: 0,
            filters: {
              vaultId: null,
              tagId: null,
              tagIds: [],
              dateFrom: null,
              dateTo: null,
              sortBy: 'created_desc',
            },
            results: [],
          });
        }

        throw new Error(`Unhandled request ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      await renderWithProviders(<SearchPage />, {
        initialEntries: ['/search'],
        routePath: '/search',
      });

      expect(screen.getByText(/semantic search/i)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/search documents/i), { target: { value: 'invoice' } });

      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?'))).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(279);
      });
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?'))).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=25&q=invoice&sortBy=created_desc&searchMode=hybrid')
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders semantic matches without fabricated highlights', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Finance', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url === '/api/tags') {
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'bills',
          pageIndex: 0,
          pageSize: 25,
          resultsCount: 1,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'created_desc',
          },
          results: [
            {
              vaultId: 'vlt_1',
              vaultName: 'Finance',
              documentId: 'doc_1',
              name: 'April Invoice.pdf',
              originalName: 'April Invoice.pdf',
              originalSize: 42000,
              mimeType: 'application/pdf',
              documentDate: '2026-04-10T00:00:00.000Z',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 1,
              bestChunk: {
                chunkIndex: 0,
                chunkType: 'section',
                pageNumber: 1,
                content: 'Invoice total due on receipt',
                snippet: 'Invoice total due on receipt',
                score: 0.8,
                matchType: 'semantic',
              },
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=bills'],
      routePath: '/search',
    });

    expect(await screen.findByText('Semantic match')).toBeInTheDocument();
    expect(screen.getByText('Invoice total due on receipt')).toBeInTheDocument();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('can turn hybrid search off for keyword-only searching', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({ vaults: [] });
      }

      if (url === '/api/tags') {
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: 'invoice',
          pageIndex: 0,
          pageSize: 25,
          resultsCount: 0,
          filters: {
            vaultId: null,
            tagId: null,
            tagIds: [],
            dateFrom: null,
            dateTo: null,
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=invoice'],
      routePath: '/search',
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url) === '/api/search?pageIndex=0&pageSize=25&q=invoice&sortBy=created_desc&searchMode=hybrid'
        ),
      ).toBe(true);
    });

    await user.click(screen.getByText(/semantic search/i));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url) === '/api/search?pageIndex=0&pageSize=25&q=invoice&sortBy=created_desc'
        ),
      ).toBe(true);
    });
  });
});

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
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
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
            sortBy: 'created_desc',
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
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.type(screen.getByLabelText(/search documents/i), 'arkivra');

    expect(await screen.findByText(/receipt for groceries/i)).toBeInTheDocument();
    expect(screen.getByText('Arkivra', { selector: 'mark' })).toBeInTheDocument();
  });

  it('renders title-only search matches without OCR snippets', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
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
            sortBy: 'created_desc',
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
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.type(screen.getByLabelText(/search documents/i), 'contract');

    expect(await screen.findByText(/employment contract/i)).toBeInTheDocument();
  });

  it('sends vault, tag, date, and sort filters to the backend', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url === '/api/tags') {
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

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.type(screen.getByLabelText(/search documents/i), 'invoice');
    await selectRadixOption(user, /^sort$/i, /name \(a-z\)/i);
    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });
    const vaultFilter = screen.getByRole('combobox', { name: /vault filter/i });
    await user.click(vaultFilter);
    await user.type(vaultFilter, 'sher');
    const sherlockOption = (await screen.findByText('Sherlock')).closest('[role="option"]');
    expect(sherlockOption).not.toBeNull();
    await user.click(sherlockOption!);
    await user.click(screen.getByRole('combobox', { name: /tags filter/i }));
    const invoicesOption = (await screen.findByText('Invoices')).closest('[role="option"]');
    expect(invoicesOption).not.toBeNull();
    await user.click(invoicesOption!);
    await user.click(screen.getByLabelText(/custom range/i));
    await user.type(screen.getByLabelText(/^from$/i), '2026-04-01');
    await user.type(screen.getByLabelText(/^to$/i), '2026-04-30');

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=100&q=invoice&vaultIds=vlt_1&tagIds=tag_1&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc')
          && (init as RequestInit | undefined)?.credentials === 'include'
        ),
      ).toBe(true);
    });
  });

  it('keeps filter search focus in the input while typing', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
            { id: 'vlt_2', name: 'Puzzle Palace', role: 'editor' },
          ],
        });
      }

      if (url === '/api/tags') {
        return jsonResponse({
          tags: [
            { id: 'tag_1', name: 'Invoices', color: '#2563eb', vaultId: 'vlt_1', vaultName: 'Sherlock' },
            { id: 'tag_2', name: 'Insurance', color: '#16a34a', vaultId: 'vlt_1', vaultName: 'Sherlock' },
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
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });

    const vaultSearch = screen.getByRole('combobox', { name: /vault filter/i });
    await user.click(vaultSearch);
    await user.type(vaultSearch, 'sher');
    expect(vaultSearch).toHaveValue('sher');
    expect(vaultSearch).toHaveFocus();

    const tagSearch = screen.getByRole('combobox', { name: /tags filter/i });
    await user.click(tagSearch);
    fireEvent.change(tagSearch, { target: { value: 'ins' } });
    expect(tagSearch).toHaveValue('ins');
    expect(tagSearch).toHaveFocus();
  });

  it('keeps vault group order stable when document sorting changes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
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

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await selectRadixOption(user, /^sort$/i, /name \(z-a\)/i);

    expect(await screen.findByText('Sherlock')).toBeInTheDocument();
    expect(screen.getByText('Puzzle Palace')).toBeInTheDocument();

    const vaultHeadings = screen.getAllByRole('button', { expanded: true }).map(node => node.textContent ?? '');
    const sherlockIndex = vaultHeadings.findIndex(text => text.includes('Sherlock'));
    const puzzlePalaceIndex = vaultHeadings.findIndex(text => text.includes('Puzzle Palace'));

    expect(sherlockIndex).toBeGreaterThanOrEqual(0);
    expect(puzzlePalaceIndex).toBeGreaterThanOrEqual(0);
    expect(sherlockIndex).toBeLessThan(puzzlePalaceIndex);
  });

  it('shows a bulk delete action bar for selected documents', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
          ],
        });
      }

      if (url.startsWith('/api/tags')) {
        return jsonResponse({ tags: [] });
      }

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_1') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith('/api/vaults/vlt_1/documents/doc_2') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
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
            sortBy: 'created_desc',
          },
          results: [
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
            {
              vaultId: 'vlt_1',
              vaultName: 'Sherlock',
              documentId: 'doc_2',
              name: 'Bravo.pdf',
              originalName: 'Bravo.pdf',
              originalSize: 42000,
              mimeType: 'application/pdf',
              documentDate: '2026-04-11T00:00:00.000Z',
              createdAt: '2026-04-11T10:00:00.000Z',
              updatedAt: '2026-04-12T10:00:00.000Z',
              matchedChunksCount: 0,
              bestChunk: null,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    await screen.findByText('Alpha');

    await user.click(screen.getByRole('checkbox', { name: /select alpha\.pdf/i }));
    await user.click(screen.getByRole('checkbox', { name: /select bravo\.pdf/i }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents/doc_1',
        expect.objectContaining({ credentials: 'include', method: 'DELETE' }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/vaults/vlt_1/documents/doc_2',
        expect.objectContaining({ credentials: 'include', method: 'DELETE' }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
    });
  });

  it('keeps custom date ranges valid in the global documents filters', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
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
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<AllDocumentsPage />, {
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

  it('returns focus to the filter trigger after dismissing the dialog with escape', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults')) {
        return jsonResponse({
          vaults: [
            { id: 'vlt_1', name: 'Sherlock', role: 'owner', aiAccessLevel: 'full', isAdmin: false },
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
            sortBy: 'created_desc',
          },
          results: [],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<AllDocumentsPage />, {
      initialEntries: ['/documents'],
      routePath: '/documents',
    });

    const filterButton = screen.getByRole('button', { name: /filter/i });
    await user.click(filterButton);
    expect(await screen.findByRole('dialog', { name: /filters/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /filters/i })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(filterButton).toHaveFocus();
    });
  });
});

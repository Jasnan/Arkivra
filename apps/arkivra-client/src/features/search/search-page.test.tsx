import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPage } from '@/features/search/pages/search-page';
import { renderWithProviders } from '@/test/utils';
import { WorkspaceHeaderHarness, jsonResponse } from './search-page.test-utils';

describe('global search page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not load every document before a query or filter is applied', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: true,
          aiFeaturesEnabled: true,
        });
      }

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

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search'],
      routePath: '/search',
    });

    expect(await screen.findByText('Search your documents')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?'))).toBe(false);
    });
  });

  it('uses the normal workspace shell header with search controls after the title', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: true,
          aiFeaturesEnabled: true,
        });
      }

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
    expect(within(shellHeader).queryByRole('heading', { name: 'Search' })).not.toBeInTheDocument();
    expect(within(shellHeader).getByLabelText(/search documents/i)).toHaveValue('invoice');
    expect(within(shellHeader).getByRole('button', { name: /grid view/i })).toBeInTheDocument();
    expect(within(shellHeader).getByRole('button', { name: /list view/i })).toBeInTheDocument();
    expect(await within(shellHeader).findByText(/^ai enhanced$/i)).toBeInTheDocument();
  });

  it('uses the migrated search and filter controls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: true,
          aiFeaturesEnabled: true,
        });
      }

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
    expect(screen.getByText(/Apr 1, 2026 - Apr 30, 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sort/i })).toHaveTextContent(/sort/i);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=25&q=invoice&vaultIds=vlt_1&tagIds=tag_1&dateFrom=2026-04-01T00%3A00%3A00.000Z&dateTo=2026-04-30T23%3A59%3A59.999Z&sortBy=name_asc&searchMode=hybrid')
          && (init as RequestInit | undefined)?.credentials === 'include'
        ),
      ).toBe(true);
    });
  });

  it('hides AI mode when AI features are disabled and searches by keyword', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: true,
          aiFeaturesEnabled: false,
        });
      }

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
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?q=invoice'],
      routePath: '/search',
    });

    await screen.findByLabelText(/search documents/i);
    expect(screen.queryByText(/^ai enhanced$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^keyword only$/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url) === '/api/search?pageIndex=0&pageSize=25&q=invoice&sortBy=created_desc'
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

  it('opens file-style context actions from search results', async () => {
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
          resultsCount: 1,
          filters: {
            vaultIds: ['vlt_1'],
            tagIds: [],
            dateFrom: '',
            dateTo: '',
            sortBy: 'created_desc',
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
      initialEntries: ['/search?q=invoice&vaultIds=vlt_1'],
      routePath: '/search',
    });

    fireEvent.contextMenu(await screen.findByRole('link', { name: /^open invoice\.pdf$/i }));

    const menu = screen.getByRole('menu', { name: /actions for invoice\.pdf/i });
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent?.trim())).toEqual([
      'Preview/open',
      'Download',
      'Rename',
      'Move to',
      'Tags',
      'Info',
      'Trash',
    ]);
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
        initialEntries: ['/search?q=paid'],
        routePath: '/search',
      });

      fireEvent.change(screen.getByLabelText(/search documents/i), { target: { value: 'invoice' } });

      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?') && String(url).includes('q=invoice'))).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(279);
      });
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search?') && String(url).includes('q=invoice'))).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=25&q=invoice&sortBy=created_desc')
          && !String(url).includes('searchMode=hybrid')
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

    expect(await screen.findByText('Meaning match')).toBeInTheDocument();
    expect(screen.getByText('Invoice total due on receipt')).toBeInTheDocument();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('can switch between AI enhanced and keyword-only searching', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: [],
          isAdmin: false,
          canCreateVault: true,
          aiFeaturesEnabled: true,
        });
      }

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

    await user.click(await screen.findByRole('button', { name: /search mode: ai enhanced/i }));
    const searchModeMenu = await screen.findByRole('menu');
    const keywordOnlyItem = within(searchModeMenu).getByText(/keyword only/i).closest('[role="menuitemradio"]');
    if (!keywordOnlyItem) {
      throw new Error('Keyword-only search mode item was not rendered');
    }
    await user.click(keywordOnlyItem);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url) === '/api/search?pageIndex=0&pageSize=25&q=invoice&sortBy=created_desc'
        ),
      ).toBe(true);
    });
  });
});

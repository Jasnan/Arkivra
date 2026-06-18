import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllDocumentsPage } from '@/features/documents/pages/all-documents-page';
import { SearchPage } from '@/features/search/pages/search-page';
import { renderWithProviders } from '@/test/utils';
import { findCalendarDate, jsonResponse, selectCalendarDate, selectRadixOption } from './search-page.test-utils';

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
            dateFrom: '2026-05-01T00:00:00.000Z',
            dateTo: '2026-05-20T23:59:59.999Z',
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
    await user.click(screen.getByRole('button', { name: /^open filters$/i }));
    await screen.findByRole('dialog', { name: /filters/i });
    const vaultFilter = screen.getByRole('combobox', { name: /filter by vaults/i });
    await user.click(vaultFilter);
    fireEvent.change(vaultFilter, { target: { value: 'sher' } });
    const sherlockOption = (await screen.findByText('Sherlock')).closest('[role="option"]');
    expect(sherlockOption).not.toBeNull();
    await user.click(sherlockOption!);
    await user.click(screen.getByRole('combobox', { name: /filter by tags/i }));
    const invoicesOption = (await screen.findByText('Invoices')).closest('[role="option"]');
    expect(invoicesOption).not.toBeNull();
    await user.click(invoicesOption!);
    await user.click(screen.getByLabelText(/custom range/i));
    const fromInput = screen.getByRole('textbox', { name: /^from$/i });
    await user.click(fromInput);
    await selectCalendarDate(user, /june 1, 2026/i);
    await waitFor(() => expect(fromInput).toHaveValue('06/01/2026'));
    await selectCalendarDate(user, /june 2, 2026/i);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url).includes('/api/search?pageIndex=0&pageSize=100&q=invoice&vaultIds=vlt_1&tagIds=tag_1&dateFrom=2026-06-01T00%3A00%3A00.000Z&dateTo=2026-06-02T23%3A59%3A59.999Z&sortBy=name_asc')
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

    await user.click(screen.getByRole('button', { name: /^open filters$/i }));
    await screen.findByRole('dialog', { name: /filters/i });

    const vaultSearch = screen.getByRole('combobox', { name: /filter by vaults/i });
    vaultSearch.focus();
    await waitFor(() => expect(vaultSearch).toHaveFocus());
    fireEvent.change(vaultSearch, { target: { value: 'sher' } });
    expect(vaultSearch).toHaveValue('sher');
    expect(vaultSearch).toHaveFocus();

    fireEvent.keyDown(vaultSearch, { key: 'Escape' });
    await waitFor(() => expect(vaultSearch).toHaveAttribute('data-state', 'closed'));
    await user.click(screen.getByRole('button', { name: /^open filters$/i }));
    await screen.findByRole('dialog', { name: /filters/i });

    const tagSearch = screen.getByRole('combobox', { name: /filter by tags/i });
    tagSearch.focus();
    await waitFor(() => expect(tagSearch).toHaveFocus());
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

  it('uses a read-only calendar range picker for global uploaded date filters', async () => {
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
    const dialog = await screen.findByRole('dialog', { name: /filters/i });
    await user.click(screen.getByLabelText(/custom range/i));

    const fromInput = screen.getByRole('textbox', { name: /^from$/i });
    const toInput = screen.getByRole('textbox', { name: /^to$/i });
    expect(fromInput).toHaveAttribute('readonly');

    await user.click(fromInput);
    expect(dialog).toContainElement(await findCalendarDate(/june 1, 2026/i));
    await selectCalendarDate(user, /june 1, 2026/i);
    await waitFor(() => expect(fromInput).toHaveValue('06/01/2026'));
    await selectCalendarDate(user, /june 2, 2026/i);

    expect(fromInput).toHaveValue('06/01/2026');
    expect(toInput).toHaveValue('06/02/2026');
  });

  it('keeps custom date ranges valid when opened from either date field', async () => {
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

    await user.click(screen.getByRole('textbox', { name: /^to$/i }));
    const futureDate = await findCalendarDate(/june 30, 2026/i);
    expect(futureDate).toHaveAttribute('aria-disabled', 'true');

    await selectCalendarDate(user, /june 1, 2026/i);
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^from$/i })).toHaveValue('06/01/2026'));
    await selectCalendarDate(user, /june 2, 2026/i);

    expect(screen.getByRole('textbox', { name: /^from$/i })).toHaveValue('06/01/2026');
    expect(screen.getByRole('textbox', { name: /^to$/i })).toHaveValue('06/02/2026');
  });

  it('does not run an unbounded global search when Any time clears the date filter', async () => {
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
        return jsonResponse({ tags: [] });
      }

      if (url.includes('/api/search?')) {
        return jsonResponse({
          query: '',
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
              vaultName: 'Sherlock',
              documentId: 'doc_1',
              name: 'All Time.pdf',
              originalName: 'All Time.pdf',
              originalSize: 41000,
              mimeType: 'application/pdf',
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

    await renderWithProviders(<SearchPage />, {
      initialEntries: ['/search?dateFrom=2026-05-01&dateTo=2026-05-20'],
      routePath: '/search',
    });

    await user.click(screen.getByRole('button', { name: /filter/i }));
    await screen.findByRole('dialog', { name: /filters/i });
    await user.click(screen.getByLabelText(/any time/i));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url, init]) =>
          String(url) === '/api/search?pageIndex=0&pageSize=25&dateFrom=2026-05-01T00%3A00%3A00.000Z&dateTo=2026-05-20T23%3A59%3A59.999Z&sortBy=created_desc'
          && (init as RequestInit | undefined)?.credentials === 'include'
        ),
      ).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: /close filters/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url) === '/api/search?pageIndex=0&pageSize=25&sortBy=created_desc'
        ),
      ).toBe(false);
    });
    expect(await screen.findByText('Search your documents')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^open all time\.pdf$/i })).not.toBeInTheDocument();
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

  it('dismisses a dirty filters dialog when escape is pressed', async () => {
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
    const vaultFilter = screen.getByRole('combobox', { name: /filter by vaults/i });
    await user.click(vaultFilter);
    await user.click((await screen.findByText('Sherlock')).closest('[role="option"]')!);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /filters/i })).not.toBeInTheDocument();
    });
  });
});

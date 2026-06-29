import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentDetailPage } from '@/features/documents/pages/document-detail-page';
import { renderWithProviders } from '@/test/utils';
import {
  enableExtractedTextPreference,
  jsonResponse,
  vaultDetailResponse,
} from '@/features/tags/tags-and-documents.test-utils';

describe('document detail tags and content', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('assigns and removes tags from document detail', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1') && (!init || init.method === undefined)) {
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

      if (url.endsWith('/api/vaults/vlt_1') && (!init || init.method === undefined)) {
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
          tags: [],
        });
      }

      if (url.endsWith('/api/tags') && (!init || init.method === undefined)) {
        return jsonResponse({
          tags: [],
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
    const addTagButton = await screen.findByRole('button', { name: /^add tag$/i });
    expect(addTagButton).toHaveTextContent(/add tag/i);
    await user.click(addTagButton);
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

  it('shows semantic search indexing status in document metadata', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1') && (!init || init.method === undefined)) {
        return jsonResponse(vaultDetailResponse());
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: 'Policy.pdf',
            originalName: 'policy.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            content: 'Parsed text',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:00:00.000Z',
            isDeleted: false,
            deletedAt: null,
            createdBy: 'Jane Doe',
            semanticIndex: {
              documentStatus: 'ready',
              expectedChunkCount: 12,
              embeddedChunkCount: 12,
              indexedAt: '2026-04-10T10:05:00.000Z',
              updatedAt: '2026-04-10T10:05:00.000Z',
            },
          },
        });
      }

      if (
        url.endsWith('/api/vaults/vlt_1/documents/doc_1/tags') &&
        (!init || init.method === undefined)
      ) {
        return jsonResponse({ tags: [] });
      }

      throw new Error(`Unhandled request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentDetailPage section="metadata" />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    expect(await screen.findByText(/semantic search/i)).toBeInTheDocument();
    expect(screen.getByText('Indexed')).toBeInTheDocument();
    expect(screen.getByText('12 / 12 chunks indexed.')).toBeInTheDocument();
    expect(screen.getByText('12 / 12')).toBeInTheDocument();
  });

  it('refreshes the document detail when upload extraction completes', async () => {
    let documentFetchCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1') && (!init || init.method === undefined)) {
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
        return new Response(
          [
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
          ].join('\n'),
          {
            headers: { 'content-type': 'text/markdown' },
          },
        );
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

    const { container } = await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/documents/doc_1'],
      routePath: '/vaults/:vaultId/documents/:documentId',
    });

    expect(
      await screen.findByText('Markdown Title'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Markdown Title' }),
    ).not.toBeInTheDocument();
    expect(container.textContent).toContain('#');
    expect(container.textContent).toContain('| Status |');
    expect(container.textContent).toContain('const preview = true;');
  });

  it('shows the unified document chat entry point and removes the legacy action item', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/vaults/vlt_1') && (!init || init.method === undefined)) {
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

      if (url.endsWith('/api/vaults/vlt_1') && (!init || init.method === undefined)) {
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

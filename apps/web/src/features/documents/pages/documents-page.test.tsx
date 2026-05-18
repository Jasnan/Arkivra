import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsPage } from '@/features/documents/pages/documents-page';
import { renderWithProviders } from '@/test/utils';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('documents page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the active vault file tree inside the browser pane', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/vaults/vlt_1') {
        return jsonResponse({
          vault: {
            id: 'vlt_1',
            name: 'MyDocs',
            description: null,
            fileCount: 2,
            totalSize: 3072,
            role: 'owner',
            aiAccessLevel: 'full',
            isRoot: false,
            isMember: true,
            accessMode: 'member',
          },
        });
      }

      if (url === '/api/vaults/vlt_1/folders/items?folderId=root') {
        return jsonResponse({
          folder: null,
          breadcrumbs: [],
          folders: [
            {
              id: 'fld_1',
              vaultId: 'vlt_1',
              parentId: null,
              name: 'Insurance',
              createdBy: 'usr_1',
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          documents: [],
          items: [],
        });
      }

      if (url === '/api/vaults/vlt_1/folders/tree') {
        return jsonResponse({
          folders: [
            { id: 'fld_1', parentId: null, name: 'Insurance', path: 'Insurance', depth: 0 },
          ],
          documents: [
            {
              id: 'doc_1',
              name: 'Policy.pdf',
              originalName: 'Policy.pdf',
              folderId: 'fld_1',
              originalSize: 2048,
              mimeType: 'application/pdf',
              processingStatus: 'completed',
              documentDate: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
              path: 'Insurance/Policy.pdf',
              depth: 1,
            },
          ],
        });
      }

      throw new Error(`Unhandled request ${url}`);
    }));

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    const fileTree = await screen.findByRole('complementary', { name: /vault file tree/i, hidden: true });
    expect(within(fileTree).getByRole('button', { name: 'MyDocs', hidden: true })).toHaveAttribute('data-state', 'open');
    expect(within(fileTree).getByRole('button', { name: 'Insurance', hidden: true })).toBeInTheDocument();
    expect(within(fileTree).queryByRole('button', { name: /create vault/i, hidden: true })).not.toBeInTheDocument();
  });
});

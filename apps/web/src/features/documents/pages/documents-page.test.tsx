import { useMemo, useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import { DocumentDetailPage } from '@/features/documents/pages/document-detail-page';
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
    installLocalStorageMock();
    window.localStorage.removeItem('arkivra.uiPreferences');
  });

  it('renders vault contents without section tabs', async () => {
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
            isAdmin: false,
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

    expect(screen.queryByRole('tab', { name: /contents/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /chat/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /sort folder items/i })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: /vault file tree/i, hidden: true })).not.toBeInTheDocument();
  });

  it('publishes the contents sort menu into the workspace header actions', async () => {
    vi.stubGlobal('fetch', installVaultContentsFetchMock());

    await renderWithProviders(<DocumentsPageWithWorkspaceHeader />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    const header = screen.getByRole('banner');
    expect(await within(header).findByRole('button', { name: /sort folder items/i })).toHaveTextContent(/a → z/i);
  });

  it('renders document detail sections without tabs and exposes section actions', async () => {
    const user = userEvent.setup();
    installDocumentDetailFetchMock();

    const { router } = await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePaths: ['/vaults/:vaultId/:documentId', '/vaults/:vaultId/:documentId/metadata'],
    });

    expect(await screen.findByTitle(/text preview/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /extracted text/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /metadata/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^chat$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open actions/i }));
    expect(screen.getByRole('menuitem', { name: /^preview$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /extracted text/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^metadata$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^activity$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^chat$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /^metadata$/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vaults/vlt_1/doc_1/metadata');
    });
  });

  it('shows the extracted text document action when enabled in preferences', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      timezone: 'auto',
      dateFormat: 'medium',
      showExtractedTextTab: true,
    }));
    installDocumentDetailFetchMock();

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    await user.click(await screen.findByRole('button', { name: /open actions/i }));
    expect(screen.getByRole('menuitem', { name: /extracted text/i })).toBeInTheDocument();
  });

  it('uses the stored default project view while keeping view toggles session-local', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      themeMode: 'system',
      accentColor: 'teal',
      density: 'comfortable',
      fontFamily: 'inter',
      fontSize: 'md',
      radius: 'md',
      language: 'en',
      timezone: 'auto',
      dateFormat: 'medium',
      showExtractedTextTab: false,
      defaultFileBrowserView: 'grid',
    }));
    vi.stubGlobal('fetch', installVaultContentsFetchMock());

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByRole('button', { name: /grid view/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /list view/i }));

    expect(screen.getByRole('button', { name: /list view/i })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}').defaultFileBrowserView).toBe('grid');
  });
});

function DocumentsPageWithWorkspaceHeader() {
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);
  const contextValue = useMemo(() => ({
    setHeaderConfig,
    setSecondaryContent: () => {},
  }), []);
  const page = useMemo(() => <DocumentsPage />, []);

  return (
    <WorkspaceLayoutContext value={contextValue}>
      <header>{headerConfig?.actions}</header>
      {page}
    </WorkspaceLayoutContext>
  );
}

function installVaultContentsFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
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
          isAdmin: false,
          isMember: true,
          accessMode: 'member',
        },
      });
    }

    if (url === '/api/vaults/vlt_1/folders/items?folderId=root') {
      return jsonResponse({
        folder: null,
        breadcrumbs: [],
        folders: [],
        documents: [],
        items: [
          {
            type: 'document',
            document: {
              id: 'doc_1',
              name: 'Policy.pdf',
              originalName: 'Policy.pdf',
              folderId: null,
              originalSize: 2048,
              mimeType: 'application/pdf',
              processingStatus: 'completed',
              documentDate: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              isDeleted: false,
              deletedAt: null,
            },
          },
        ],
      });
    }

    if (url === '/api/vaults/vlt_1/folders/tree') {
      return jsonResponse({ folders: [], documents: [] });
    }

    throw new Error(`Unhandled request ${url}`);
  });
}

function installDocumentDetailFetchMock() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/vaults/vlt_1/documents/doc_1') {
      return jsonResponse({
        document: {
          id: 'doc_1',
          name: 'Policy.txt',
          originalName: 'Policy.txt',
          folderId: null,
          originalSize: 2048,
          originalSha256Hash: 'abc123',
          mimeType: 'text/plain',
          processingStatus: 'completed',
          documentDate: null,
          language: null,
          content: 'Extracted policy text',
          displayContent: 'Extracted policy text',
          createdBy: 'usr_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          isDeleted: false,
          deletedAt: null,
        },
      });
    }

    if (url === '/api/vaults/vlt_1/documents/doc_1/tags') {
      return jsonResponse({ tags: [] });
    }

    if (url === '/api/tags') {
      return jsonResponse({ tags: [] });
    }

    if (url === '/api/vaults/vlt_1') {
      return jsonResponse({
        vault: {
          id: 'vlt_1',
          name: 'MyDocs',
          description: null,
          fileCount: 1,
          totalSize: 2048,
          role: 'owner',
          aiAccessLevel: 'full',
          isAdmin: false,
          isMember: true,
          accessMode: 'member',
        },
      });
    }

    if (url === '/api/vaults/vlt_1/folders/tree') {
      return jsonResponse({ folders: [], documents: [] });
    }

    throw new Error(`Unhandled request ${url}`);
  }));
}

function installLocalStorageMock() {
  const store = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
    },
  });
}

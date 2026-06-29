import { useMemo, useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import { DocumentDetailPage } from '@/features/documents/pages/document-detail-page';
import { DocumentsPage } from '@/features/documents/pages/documents-page';
import { UPLOAD_ACCEPT_ATTRIBUTE } from '@/features/uploads/upload-file-rules';
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
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
      }),
    );

    const { container } = await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(screen.queryByRole('tab', { name: /contents/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /chat/i })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /sort folder items/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: /vault file tree/i, hidden: true }),
    ).not.toBeInTheDocument();

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    const fileInput = inputs.find(
      (input) => input.getAttribute('accept') === UPLOAD_ACCEPT_ATTRIBUTE,
    );
    const directoryInput = inputs.find((input) => input.hasAttribute('webkitdirectory'));
    expect(fileInput).toBeDefined();
    expect(directoryInput).toBeDefined();
    expect(directoryInput).toHaveAttribute('directory');
    expect(directoryInput).not.toHaveAttribute('accept');
  });

  it('publishes the contents sort menu into the workspace header actions', async () => {
    vi.stubGlobal('fetch', installVaultContentsFetchMock());

    await renderWithProviders(<DocumentsPageWithWorkspaceHeader />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    const header = screen.getByRole('banner');
    expect(
      await within(header).findByRole('button', { name: /sort folder items/i }),
    ).toHaveTextContent(/a → z/i);
  });

  it('shows the vault background context menu with workspace actions for owners with chat access', async () => {
    vi.stubGlobal('fetch', installVaultContentsFetchMock({ items: [] }));

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    fireEvent.contextMenu(await screen.findByText(/this vault is empty/i));

    const menu = await screen.findByRole('menu', { name: /actions for vault root/i });
    expect(within(menu).getByText('MyDocs')).toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual([
      'New folder',
      'Upload files',
      'Upload folder',
      'Retry failed parsing',
      'Members',
      'Settings',
      'Activity',
      'Chat',
    ]);
  });

  it('includes document versions in the vault contents context menu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', installVaultContentsFetchMock());

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    fireEvent.contextMenu(await screen.findByText('Policy'));

    const menu = await screen.findByRole('menu', { name: /actions for policy\.pdf/i });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual([
      'Preview/open',
      'Download',
      'Versions',
      'Rename',
      'Move to',
      'Tags',
      'Info',
      'Trash',
    ]);

    await user.click(within(menu).getByRole('menuitem', { name: /^versions$/i }));

    const dialog = await screen.findByRole('dialog', { name: /^versions$/i });
    expect(within(dialog).getByText('v1')).toBeInTheDocument();
    expect(within(dialog).getByText('Current')).toBeInTheDocument();
  });

  it('gates vault background workspace actions by admin and chat permissions', async () => {
    vi.stubGlobal(
      'fetch',
      installVaultContentsFetchMock({
        items: [],
        vault: {
          role: 'editor',
          aiAccessLevel: 'none',
          isAdmin: false,
          accessMode: 'member',
        },
      }),
    );

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    fireEvent.contextMenu(await screen.findByText(/this vault is empty/i));

    const menu = await screen.findByRole('menu', { name: /actions for vault root/i });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['New folder', 'Upload files', 'Upload folder', 'Retry failed parsing']);
    expect(within(menu).queryByRole('menuitem', { name: /^members$/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^activity$/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^settings$/i })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^chat$/i })).not.toBeInTheDocument();
  });

  it('restricts direct members and settings routes to vault managers', async () => {
    const fetchMock = installVaultContentsFetchMock({
      items: [],
      vault: {
        role: 'viewer',
        aiAccessLevel: 'none',
        isAdmin: false,
        accessMode: 'member',
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage section="members" />, {
      initialEntries: ['/vaults/vlt_1/members'],
      routePath: '/vaults/:vaultId/members',
    });

    expect(await screen.findByText(/vault management is restricted/i)).toBeInTheDocument();
    expect(
      screen.getByText(/only vault owners and admins can view members and settings/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/vaults/vlt_1/members', expect.anything());
  });

  it('keeps vault activity visible to regular members without exposing management tabs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/me') {
          return jsonResponse({
            userId: 'usr_1',
            sessionId: 'ses_1',
            systemRole: 'member',
            systemCapabilities: ['system.create_vaults'],
            isAdmin: false,
            canCreateVault: true,
            aiFeaturesEnabled: true,
          });
        }

        if (url === '/api/vaults/vlt_1') {
          return jsonResponse({
            vault: {
              id: 'vlt_1',
              name: 'MyDocs',
              description: null,
              fileCount: 2,
              totalSize: 3072,
              role: 'viewer',
              aiAccessLevel: 'none',
              isAdmin: false,
              isMember: true,
              accessMode: 'member',
            },
          });
        }

        if (url === '/api/vaults/vlt_1/activity?limit=50') {
          return jsonResponse({ activity: [], nextCursor: null });
        }

        throw new Error(`Unhandled request ${url}`);
      }),
    );

    await renderWithProviders(<DocumentsPage section="activity" />, {
      initialEntries: ['/vaults/vlt_1/activity'],
      routePath: '/vaults/:vaultId/activity',
    });

    expect((await screen.findAllByRole('tab')).map((tab) => tab.textContent?.trim())).toEqual([
      'Activity',
    ]);
    expect(await screen.findByText(/no vault activity yet/i)).toBeInTheDocument();
  });

  it('hides vault chat actions when AI features are disabled globally', async () => {
    const fetchMock = installVaultContentsFetchMock({ aiFeaturesEnabled: false, items: [] });
    vi.stubGlobal('fetch', fetchMock);

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/me')).toBe(true);
    });

    fireEvent.contextMenu(await screen.findByText(/this vault is empty/i));

    const menu = await screen.findByRole('menu', { name: /actions for vault root/i });
    expect(within(menu).getByRole('menuitem', { name: /^settings$/i })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^chat$/i })).not.toBeInTheDocument();
  });

  it('renders document detail sections without tabs and exposes section actions', async () => {
    const user = userEvent.setup();
    installDocumentDetailFetchMock();

    const { router } = await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePaths: ['/vaults/:vaultId/:documentId', '/vaults/:vaultId/:documentId/metadata'],
    });

    expect(await screen.findByText(/extracted policy text/i)).toBeInTheDocument();
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

    await user.click(screen.getByRole('menuitem', { name: /^chat$/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/chat');
      expect(router.state.location.search).toEqual({
        vaultId: 'vlt_1',
        documentId: 'doc_1',
        documentName: 'Policy.txt',
      });
    });

    await router.navigate({ to: '/vaults/vlt_1/doc_1' });
    await user.click(screen.getByRole('button', { name: /open actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /^metadata$/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vaults/vlt_1/doc_1/metadata');
    });
  });

  it('renders browser image previews when the stored MIME type is generic', async () => {
    installDocumentDetailFetchMock({
      documentName: 'Scan.webp',
      mimeType: 'application/octet-stream',
    });

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    expect(await screen.findByRole('img', { name: 'Scan.webp' })).toHaveAttribute(
      'src',
      '/api/vaults/vlt_1/documents/doc_1/file',
    );
    expect(screen.queryByTitle(/text preview/i)).not.toBeInTheDocument();
  });

  it('renders JSON files as text previews', async () => {
    installDocumentDetailFetchMock({
      documentName: 'client_secret_google_auth_arkivra.json',
      mimeType: 'application/json',
      fileText: '{\n  "installed": {\n    "client_id": "local-test"\n  }\n}',
    });

    const { container } = await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    await screen.findByText('"client_id"');
    expect(container.textContent).toContain('"client_id": "local-test"');
    expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
  });

  it('renders .json files as text previews when the stored MIME type is generic', async () => {
    installDocumentDetailFetchMock({
      documentName: 'settings.json',
      mimeType: 'application/octet-stream',
      fileText: '{\n  "theme": "system"\n}',
    });

    const { container } = await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    await screen.findByText('"theme"');
    expect(container.textContent).toContain('"theme": "system"');
    expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
  });

  it('renders generated PDF previews for Office documents without changing the stored MIME type', async () => {
    installDocumentDetailFetchMock({
      documentName: 'Resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      hasPreviewPdf: true,
    });

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    expect(await screen.findByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
  });

  it('shows pending preview generation for Office documents before the derived PDF is ready', async () => {
    installDocumentDetailFetchMock({
      documentName: 'Resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      derivedPreviewStatus: 'pending',
    });

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    expect(await screen.findByText(/generating preview/i)).toBeInTheDocument();
    expect(screen.getByText(/generating a preview for this document/i)).toBeInTheDocument();
    expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
  });

  it('shows failed preview generation without hiding document availability', async () => {
    installDocumentDetailFetchMock({
      documentName: 'Resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      derivedPreviewStatus: 'failed',
    });

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    expect(await screen.findByText(/preview couldn't be generated/i)).toBeInTheDocument();
    expect(screen.getByText(/original document is still available/i)).toBeInTheDocument();
    expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
  });

  it('shows unavailable copy when Office conversion runtime is unreachable', async () => {
    installDocumentDetailFetchMock({
      documentName: 'Resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      derivedPreviewStatus: 'unavailable',
      derivedPreviewErrorCode: 'document.preview_conversion_unavailable',
    });

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    expect(await screen.findByText(/preview unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/office document conversion is currently unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/stored safely and can still be downloaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/generating preview/i)).not.toBeInTheDocument();
  });

  it('shows administrator-disabled copy when Office conversion is paused', async () => {
    installDocumentDetailFetchMock({
      documentName: 'Resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      derivedPreviewStatus: 'unavailable',
      derivedPreviewErrorCode: 'document.preview_conversion_disabled',
    });

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    expect(await screen.findByText(/preview unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/disabled by your administrator/i)).toBeInTheDocument();
    expect(screen.queryByText(/generating preview/i)).not.toBeInTheDocument();
  });

  it('shows the full document filename in the workspace breadcrumb when space allows', async () => {
    const documentName = 'Home Insurance Renewal Documents 2026.pdf';
    installDocumentDetailFetchMock({ documentName });

    await renderWithProviders(<DocumentDetailPageWithWorkspaceHeader />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    const header = screen.getByRole('banner');
    expect(await within(header).findByText(documentName)).toBeInTheDocument();
    expect(within(header).queryByText('Home In...')).not.toBeInTheDocument();
  });

  it('shows the text and chunks document action when enabled in preferences', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'arkivra.uiPreferences',
      JSON.stringify({
        themeMode: 'system',
        accentColor: 'teal',
        density: 'comfortable',
        fontFamily: 'inter',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        showExtractedTextTab: true,
      }),
    );
    installDocumentDetailFetchMock();

    await renderWithProviders(<DocumentDetailPage />, {
      initialEntries: ['/vaults/vlt_1/doc_1'],
      routePath: '/vaults/:vaultId/:documentId',
    });

    await user.click(await screen.findByRole('button', { name: /open actions/i }));
    expect(screen.getByRole('menuitem', { name: /text & chunks/i })).toBeInTheDocument();
  });

  it('shows stored chunks in the document content view', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'arkivra.uiPreferences',
      JSON.stringify({
        themeMode: 'system',
        accentColor: 'teal',
        density: 'comfortable',
        fontFamily: 'inter',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        showExtractedTextTab: true,
      }),
    );
    installDocumentDetailFetchMock({
      chunks: [
        {
          id: 'chk_1',
          chunkIndex: 0,
          content: 'Stored chunk content',
          originalText: 'Stored chunk content',
          section: 'Policy scope',
          sectionPath: ['Policy scope'],
          pageNumber: null,
          pageStart: null,
          pageEnd: null,
          chunkType: 'paragraph',
          tokenCount: 12,
          parserEngine: 'docling',
          citationPrecision: 'document',
          sourceElementIds: ['#/texts/1'],
          metadata: { doclingFilename: 'Policy.txt' },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    await renderWithProviders(<DocumentDetailPage section="content" />, {
      initialEntries: ['/vaults/vlt_1/doc_1/extracted-text'],
      routePath: '/vaults/:vaultId/:documentId/extracted-text',
    });

    expect(await screen.findByText('Extracted policy text')).toBeInTheDocument();
    expect(screen.queryByText(/^Processed$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /extracted text and retrieval chunks appear here after processing completes/i,
      ),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^chunks$/i }));
    expect(await screen.findByText('Stored chunk content')).toBeInTheDocument();
    expect(screen.getByText('Policy scope')).toBeInTheDocument();
  });

  it('uses and updates the shared default vault browser view', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'arkivra.uiPreferences',
      JSON.stringify({
        themeMode: 'system',
        accentColor: 'teal',
        density: 'comfortable',
        fontFamily: 'inter',
        fontSize: 'md',
        radius: 'md',
        language: 'en',
        showExtractedTextTab: false,
        defaultFileBrowserView: 'grid',
      }),
    );
    vi.stubGlobal('fetch', installVaultContentsFetchMock());

    await renderWithProviders(<DocumentsPage />, {
      initialEntries: ['/vaults/vlt_1'],
      routePath: '/vaults/:vaultId',
    });

    expect(await screen.findByRole('button', { name: /grid view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: /list view/i }));

    expect(screen.getByRole('button', { name: /list view/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      JSON.parse(window.localStorage.getItem('arkivra.uiPreferences') ?? '{}')
        .defaultFileBrowserView,
    ).toBe('list');
  });
});

function DocumentsPageWithWorkspaceHeader() {
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);
  const contextValue = useMemo(
    () => ({
      setHeaderConfig,
      setSecondaryContent: () => {},
    }),
    [],
  );
  const page = useMemo(() => <DocumentsPage />, []);

  return (
    <WorkspaceLayoutContext value={contextValue}>
      <header>{headerConfig?.actions}</header>
      {page}
    </WorkspaceLayoutContext>
  );
}

function DocumentDetailPageWithWorkspaceHeader() {
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);
  const contextValue = useMemo(
    () => ({
      setHeaderConfig,
      setSecondaryContent: () => {},
    }),
    [],
  );
  const page = useMemo(() => <DocumentDetailPage />, []);

  return (
    <WorkspaceLayoutContext value={contextValue}>
      <header>{headerConfig?.left}</header>
      {page}
    </WorkspaceLayoutContext>
  );
}

function installVaultContentsFetchMock({
  vault: vaultOverrides = {},
  items = [
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
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isDeleted: false,
        deletedAt: null,
      },
    },
  ],
  aiFeaturesEnabled = true,
}: {
  vault?: Record<string, unknown>;
  items?: unknown[];
  aiFeaturesEnabled?: boolean;
} = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/me') {
      return jsonResponse({
        userId: 'usr_1',
        sessionId: 'ses_1',
        systemRole: 'member',
        systemCapabilities: ['system.create_vaults'],
        isAdmin: false,
        canCreateVault: true,
        aiFeaturesEnabled,
      });
    }

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
          ...vaultOverrides,
        },
      });
    }

    if (url === '/api/vaults/vlt_1/folders/items?folderId=root') {
      return jsonResponse({
        folder: null,
        breadcrumbs: [],
        folders: [],
        documents: [],
        items,
      });
    }

    if (url === '/api/vaults/vlt_1/folders/tree') {
      return jsonResponse({ folders: [], documents: [] });
    }

    if (url === '/api/vaults/vlt_1/documents/doc_1/versions') {
      return jsonResponse({
        versions: [
          {
            id: 'dvr_1',
            documentId: 'doc_1',
            vaultId: 'vlt_1',
            versionNumber: 1,
            isCurrent: true,
            uploadedBy: 'usr_1',
            uploadedAt: '2026-01-01T00:00:00.000Z',
            originalName: 'Policy.pdf',
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType: 'application/pdf',
            language: null,
            parserEngine: 'docling',
            parserEngineVersion: 'test',
            parserWarnings: [],
            processingStatus: 'completed',
            restoredFromVersionId: null,
            deletedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            document: {
              id: 'doc_1',
              vaultId: 'vlt_1',
              name: 'Policy.pdf',
              folderId: null,
              currentVersionId: 'dvr_1',
              isDeleted: false,
              deletedAt: null,
            },
          },
        ],
      });
    }

    throw new Error(`Unhandled request ${url}`);
  });
}

function installDocumentDetailFetchMock({
  documentName = 'Policy.txt',
  mimeType = 'text/plain',
  fileText = 'Extracted policy text',
  hasPreviewPdf = false,
  derivedPreviewStatus = 'unavailable',
  derivedPreviewErrorCode = null,
  chunks = [],
}: {
  documentName?: string;
  mimeType?: string;
  fileText?: string;
  hasPreviewPdf?: boolean;
  derivedPreviewStatus?: 'pending' | 'ready' | 'unavailable' | 'failed';
  derivedPreviewErrorCode?: string | null;
  chunks?: unknown[];
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/me') {
        return jsonResponse({
          userId: 'usr_1',
          sessionId: 'ses_1',
          systemRole: 'member',
          systemCapabilities: ['system.create_vaults'],
          isAdmin: false,
          canCreateVault: true,
          aiFeaturesEnabled: true,
        });
      }

      if (url === '/api/vaults/vlt_1/documents/doc_1') {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: documentName,
            originalName: documentName,
            folderId: null,
            originalSize: 2048,
            originalSha256Hash: 'abc123',
            mimeType,
            processingStatus: 'completed',
            hasPreviewPdf,
            derivedPreviewStatus,
            derivedPreviewErrorCode,
            derivedPreviewErrorMessage: null,
            derivedPreviewFailedAt: null,
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

      if (url === '/api/vaults/vlt_1/documents/doc_1/chunks') {
        return jsonResponse({ chunks });
      }

      if (url === '/api/vaults/vlt_1/documents/doc_1/file') {
        return new Response(fileText, {
          status: 200,
          headers: { 'content-type': mimeType },
        });
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
    }),
  );
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

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { DocumentVersionsDialog } from './document-versions-dialog';
import type { DocumentVersionSummary } from '@/features/documents/documents.types';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function version(overrides: Partial<DocumentVersionSummary> = {}): DocumentVersionSummary {
  return {
    id: 'dvr_1',
    documentId: 'doc_1',
    vaultId: 'vlt_1',
    versionNumber: 1,
    isCurrent: false,
    uploadedBy: 'usr_1',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    originalName: 'Employee Handbook.pdf',
    originalSize: 1024,
    originalSha256Hash: 'hash-1',
    mimeType: 'application/pdf',
    language: null,
    parserEngine: 'docling',
    parserEngineVersion: '1.0.0',
    parserWarnings: null,
    processingStatus: 'completed',
    restoredFromVersionId: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    document: {
      id: 'doc_1',
      vaultId: 'vlt_1',
      name: 'Employee Handbook.pdf',
      folderId: null,
      currentVersionId: 'dvr_2',
      isDeleted: false,
      deletedAt: null,
    },
    ...overrides,
  };
}

function renderDialog() {
  return renderWithProviders(
    <DocumentVersionsDialog
      open
      onOpenChange={vi.fn()}
      vaultId="vlt_1"
      documentId="doc_1"
      versions={[version()]}
      isLoading={false}
      isError={false}
      selectedVersionId={null}
      isRestorePending={false}
      isDeletePending={false}
      onSelectVersion={vi.fn()}
      onRestoreVersion={vi.fn()}
      onDeleteVersion={vi.fn(async () => undefined)}
    />,
  );
}

describe('document versions dialog', () => {
  it('renders citation impact warning before deleting a referenced version', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        impact: {
          affectedConversationCount: 3,
          affectedConversations: [
            { id: 'cht_1', title: 'HR Policy Review' },
            { id: 'cht_2', title: 'Employee Benefits' },
            { id: 'cht_3', title: 'Payroll Questions' },
          ],
          limit: 5,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderDialog();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByRole('heading', { name: 'Delete v1?' })).toBeInTheDocument();
    expect(screen.getByText('This version is referenced by 3 conversations.')).toBeInTheDocument();
    expect(screen.getByText('Deleting it will:')).toBeInTheDocument();
    expect(screen.getByText('preserve conversation history')).toBeInTheDocument();
    expect(screen.getByText('remove source content')).toBeInTheDocument();
    expect(screen.getByText('make the affected conversations read-only')).toBeInTheDocument();
    expect(screen.getByText('Affected conversations:')).toBeInTheDocument();
    expect(screen.getByText('HR Policy Review')).toBeInTheDocument();
    expect(screen.getByText('Employee Benefits')).toBeInTheDocument();
    expect(screen.getByText('Payroll Questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete version/i })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/deletion-impact?limit=5',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('renders normal delete confirmation when no conversations are affected', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          impact: {
            affectedConversationCount: 0,
            affectedConversations: [],
            limit: 5,
          },
        }),
      ),
    );

    await renderDialog();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/This removes this older version from the version history/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Affected conversations/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete version/i })).toBeEnabled();
  });
});

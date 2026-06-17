import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { TrashConfirmDialog } from './document-trash-page';

describe('trash confirm dialog', () => {
  it('clears stale page locks after closing', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);

      return (
        <TrashConfirmDialog
          open={open}
          title="Delete Employee Handbook?"
          description="This permanently deletes the selected document data from Arkivra. This action cannot be undone."
          confirmLabel="Delete document"
          pendingLabel="Deleting..."
          isPending={false}
          onClose={() => setOpen(false)}
          onConfirm={vi.fn()}
        />
      );
    }

    await renderWithProviders(<Harness />);

    document.body.setAttribute('data-inert', '');
    document.body.setAttribute('data-scroll-lock', '');
    document.body.style.pointerEvents = 'none';
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body).not.toHaveAttribute('data-inert');
      expect(document.body).not.toHaveAttribute('data-scroll-lock');
      expect(document.body.style.pointerEvents).toBe('');
    });
  });

  it('renders document deletion impact warning with a capped conversation list', async () => {
    await renderWithProviders(
      <TrashConfirmDialog
        open
        title="Delete Employee Handbook?"
        description="This permanently deletes the selected document data from Arkivra. This action cannot be undone."
        confirmLabel="Delete document"
        pendingLabel="Deleting..."
        isPending={false}
        impact={{
          affectedConversationCount: 27,
          versionCount: 4,
          limit: 5,
          affectedConversations: [
            {
              id: 'cht_1',
              title: 'HR Policy Review',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 'cht_2',
              title: 'Employee Benefits',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 'cht_3',
              title: 'Payroll Questions',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 'cht_4',
              title: 'Chat D',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 'cht_5',
              title: 'Chat E',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
        }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Delete Employee Handbook?' })).toBeInTheDocument();
    expect(screen.getByText('This document contains 4 versions.')).toBeInTheDocument();
    expect(
      screen.getByText('Some versions are referenced by 27 conversations.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Deleting this document will:')).toBeInTheDocument();
    expect(screen.getByText('permanently remove all versions')).toBeInTheDocument();
    expect(screen.getByText('preserve conversation history')).toBeInTheDocument();
    expect(screen.getByText('make the affected conversations read-only')).toBeInTheDocument();
    expect(screen.getByText('Affected conversations (27):')).toBeInTheDocument();
    expect(screen.getByText('HR Policy Review')).toBeInTheDocument();
    expect(screen.getByText('Employee Benefits')).toBeInTheDocument();
    expect(screen.getByText('Payroll Questions')).toBeInTheDocument();
    expect(screen.getByText('Showing 5 of 27 conversations.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete document/i })).toBeEnabled();
  });

  it('renders bulk deletion impact as a count without conversation names', async () => {
    await renderWithProviders(
      <TrashConfirmDialog
        open
        title="Delete 500 documents?"
        description="This permanently deletes the selected document data from Arkivra. This action cannot be undone."
        confirmLabel="Delete 500 documents"
        pendingLabel="Deleting..."
        isPending={false}
        impact={{
          documentCount: 500,
          versionCount: 914,
          affectedConversationCount: 124,
        }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Delete 500 documents?' })).toBeInTheDocument();
    expect(
      screen.getByText('These documents are referenced by conversations.'),
    ).toBeInTheDocument();
    expect(screen.getByText('This may affect existing conversations.')).toBeInTheDocument();
    expect(screen.getByText('Affected conversations: 124')).toBeInTheDocument();
    expect(screen.getByText('Deleting these documents will:')).toBeInTheDocument();
    expect(screen.getByText('permanently remove all versions')).toBeInTheDocument();
    expect(screen.getByText('preserve conversation history')).toBeInTheDocument();
    expect(screen.getByText('make affected conversations read-only')).toBeInTheDocument();
    expect(screen.queryByText('HR Policy Review')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete 500 documents/i })).toBeEnabled();
  });
});

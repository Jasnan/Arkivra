import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoveItemDialog } from './vault-browser-components';
import type { BrowserItem, MoveDestination } from './vault-browser.types';
import { renderWithProviders } from '@/test/utils';

const documentTarget: BrowserItem = {
  type: 'document',
  document: {
    id: 'doc_1',
    name: 'Budget.pdf',
    originalName: 'Budget.pdf',
    folderId: null,
    originalSize: 1024,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    documentDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
  },
};

const destinations: MoveDestination[] = [
  { id: null, name: 'Vault root', label: 'Vault root', depth: 0 },
  { id: 'fld_projects', name: 'Projects', label: 'Projects', depth: 1 },
  { id: 'fld_invoices', name: 'Invoices', label: 'Projects/Invoices', depth: 2 },
  { id: 'fld_archive', name: 'Archive', label: 'Archive', depth: 1 },
];

describe('move item dialog', () => {
  it('filters folder destinations and selects a matching folder', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    await renderWithProviders(
      <MoveItemDialog
        target={documentTarget}
        value={null}
        destinations={destinations}
        isPending={false}
        isLoading={false}
        onValueChange={onValueChange}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: /move budget\.pdf/i });
    const destinationList = within(dialog).getByRole('listbox', { name: /move destination/i });

    expect(within(destinationList).getByRole('option', { name: /vault root/i })).toHaveAttribute('aria-selected', 'true');

    await user.type(within(dialog).getByLabelText(/search folders/i), 'invoice');

    const invoiceDestination = within(destinationList).getByRole('option', { name: /projects\/invoices/i });
    expect(invoiceDestination).toBeInTheDocument();
    expect(within(destinationList).queryByRole('option', { name: /^archive/i })).not.toBeInTheDocument();

    await user.click(invoiceDestination);

    expect(onValueChange).toHaveBeenCalledWith('fld_invoices');
  });
});

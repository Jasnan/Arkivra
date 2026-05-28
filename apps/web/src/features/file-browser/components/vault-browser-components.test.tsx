import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserContextMenu, BrowserItemGrid, BrowserItemList, MoveItemDialog, RenameItemDialog } from './vault-browser-components';
import { getMoveDestinations } from './vault-browser.types';
import type { BrowserItem, MoveDestination } from './vault-browser.types';
import { renderWithProviders } from '@/test/utils';

const folderTarget: BrowserItem = {
  type: 'folder',
  folder: {
    id: 'fld_projects',
    vaultId: 'vlt_1',
    parentId: null,
    name: 'Projects',
    createdBy: 'usr_1',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

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

function ControlledRenameDialogHarness({ onClose }: { onClose: () => void }) {
  const [target, setTarget] = useState<BrowserItem | null>(folderTarget);

  return (
    <>
      <button type="button">Outside action</button>
      <RenameItemDialog
        open={target !== null}
        target={target}
        value={target === null ? '' : 'Projects'}
        isPending={false}
        onValueChange={vi.fn()}
        onClose={() => {
          onClose();
          setTarget(null);
        }}
        onSubmit={vi.fn()}
      />
    </>
  );
}

function ControlledMoveDialogHarness({ onClose }: { onClose: () => void }) {
  const [target, setTarget] = useState<BrowserItem | null>(documentTarget);

  return (
    <>
      <button type="button">Outside action</button>
      <MoveItemDialog
        open={target !== null}
        target={target}
        value={null}
        destinations={destinations}
        isPending={false}
        isLoading={false}
        onValueChange={vi.fn()}
        onClose={() => {
          onClose();
          setTarget(null);
        }}
        onSubmit={vi.fn()}
      />
    </>
  );
}

describe('move item dialog', () => {
  it('positions context menus inside the viewport using the measured menu size', async () => {
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 260,
      top: 0,
      right: 200,
      bottom: 260,
      left: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });

    await renderWithProviders(
      <BrowserContextMenu
        state={{ item: { type: 'root', vaultId: 'vlt_1' }, x: 480, y: 580 }}
        actions={[{ key: 'open', label: 'Open', icon: FolderOpen, onSelect: vi.fn() }]}
        onClose={vi.fn()}
      />,
    );

    const menu = screen.getByRole('menu', { name: /actions for vault root/i });

    await waitFor(() => {
      expect(menu).toHaveStyle({ left: '292px', top: '332px' });
    });

    getBoundingClientRect.mockRestore();
  });

  it('lists common move destinations for multiple selected folders and documents', () => {
    const destinations = getMoveDestinations({
      folders: [
        { id: 'fld_projects', parentId: null, name: 'Projects', path: 'Projects', depth: 0 },
        { id: 'fld_invoices', parentId: 'fld_projects', name: 'Invoices', path: 'Projects/Invoices', depth: 1 },
        { id: 'fld_archive', parentId: null, name: 'Archive', path: 'Archive', depth: 0 },
        { id: 'fld_receipts', parentId: 'fld_archive', name: 'Receipts', path: 'Archive/Receipts', depth: 1 },
      ],
      target: [
        folderTarget,
        {
          type: 'folder',
          folder: {
            ...folderTarget.folder,
            id: 'fld_archive',
            name: 'Archive',
          },
        },
        documentTarget,
      ],
    });

    expect(destinations.map(destination => destination.id)).toEqual([null]);
  });

  it('labels the move dialog for multiple selected items', async () => {
    await renderWithProviders(
      <MoveItemDialog
        open
        target={[folderTarget, documentTarget]}
        value={null}
        destinations={destinations}
        isPending={false}
        isLoading={false}
        onValueChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(await screen.findByRole('dialog', { name: /move 2 items/i })).toBeInTheDocument();
  });

  it('filters folder destinations and selects a matching folder', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    await renderWithProviders(
      <MoveItemDialog
        open
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

  it('dismisses rename through controlled dialog state without blocking later clicks', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    await renderWithProviders(<ControlledRenameDialogHarness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /rename folder/i })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /outside action/i }));
  });

  it('dismisses move through controlled dialog state without blocking later clicks', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    await renderWithProviders(<ControlledMoveDialogHarness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /move budget\.pdf/i })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /outside action/i }));
  });

  it('marks selected list rows and exposes folder drop interactions', async () => {
    const user = userEvent.setup();
    const onOpenItem = vi.fn();
    const onSelectItem = vi.fn();
    const onDragOverFolder = vi.fn();

    await renderWithProviders(
      <BrowserItemList
        items={[folderTarget, documentTarget]}
        vaultId="vlt_1"
        selectedItemKeys={new Set(['document-doc_1'])}
        draggedItemKeys={new Set(['document-doc_1'])}
        dropTarget={{ folderId: 'fld_projects', state: 'valid' }}
        onOpenItem={onOpenItem}
        onSelectItem={onSelectItem}
        getItemActions={() => []}
        onDragStartItem={vi.fn()}
        onDragEndItem={vi.fn()}
        onDragOverFolder={onDragOverFolder}
        onDragLeaveFolder={vi.fn()}
        onDropOnFolder={vi.fn()}
        onOpenContextMenu={vi.fn()}
        onOpenBackgroundContextMenu={vi.fn()}
      />,
    );

    const documentRow = await screen.findByRole('option', { name: 'Budget.pdf' });
    expect(documentRow).toHaveAttribute('aria-selected', 'true');

    await user.click(documentRow);
    expect(onOpenItem).toHaveBeenCalledWith(documentTarget);

    fireEvent.click(documentRow, { ctrlKey: true });
    expect(onSelectItem.mock.calls.at(-1)?.[1]).toEqual(documentTarget);

    const folderRow = screen.getByRole('option', { name: 'Projects' });
    fireEvent.dragOver(folderRow, {
      dataTransfer: {
        dropEffect: 'move',
        types: ['application/x-arkivra-browser-items'],
      },
    });

    expect(onDragOverFolder.mock.calls.at(-1)?.[1]).toBe('fld_projects');
  });

  it('shortens comfortable grid item names over twelve characters with a full-name hover title', async () => {
    const longFolder: BrowserItem = {
      type: 'folder',
      folder: {
        ...folderTarget.folder,
        id: 'fld_long_name',
        name: 'jasnan_niederlassungs_erlaubnis',
      },
    };

    await renderWithProviders(
      <BrowserItemGrid
        items={[longFolder]}
        vaultId="vlt_1"
        selectedItemKeys={new Set()}
        draggedItemKeys={new Set()}
        dropTarget={null}
        onOpenItem={vi.fn()}
        onSelectItem={vi.fn()}
        getItemActions={() => []}
        onDragStartItem={vi.fn()}
        onDragEndItem={vi.fn()}
        onDragOverFolder={vi.fn()}
        onDragLeaveFolder={vi.fn()}
        onDropOnFolder={vi.fn()}
        onOpenContextMenu={vi.fn()}
        onOpenBackgroundContextMenu={vi.fn()}
      />,
    );

    const gridName = await screen.findByText('jasnan_niederlass...');

    expect(gridName).toHaveAttribute('aria-label', 'jasnan_niederlassungs_erlaubnis');
    expect(gridName).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  });
});

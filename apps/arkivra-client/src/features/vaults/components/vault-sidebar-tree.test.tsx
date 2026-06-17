import { fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBrowserDragDrop } from '@/features/documents/hooks/use-browser-drag-drop';
import type { BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { VaultBrowserDragDropProvider } from '@/features/file-browser/components/vault-browser-drag-drop-context';
import {
  BrowserCurrentFolderDropZone,
  BrowserItemList,
  VaultRouteBreadcrumbs,
} from '@/features/file-browser/components/vault-browser-components';
import { renderWithProviders } from '@/test/utils';
import { VaultSidebarTree } from './vault-sidebar-tree';

const folders = [
  { id: 'fld_projects', parentId: null, name: 'Projects', path: 'Projects', depth: 0 },
  { id: 'fld_archive', parentId: 'fld_projects', name: 'Archive', path: 'Projects / Archive', depth: 1 },
];

const documents = [
  {
    id: 'doc_budget',
    name: 'Budget.pdf',
    originalName: 'Budget.pdf',
    folderId: null,
    originalSize: 1024,
    mimeType: 'application/pdf',
    processingStatus: 'completed' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
    path: 'Budget.pdf',
    depth: 0,
  },
];

const panelDocumentItem: BrowserItem = {
  type: 'document',
  document: {
    id: 'doc_panel',
    name: 'Panel Budget.pdf',
    originalName: 'Panel Budget.pdf',
    folderId: null,
    originalSize: 2048,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
  },
};

const panelFolderItem: BrowserItem = {
  type: 'folder',
  folder: {
    id: 'fld_panel',
    vaultId: 'vlt_1',
    parentId: null,
    name: 'Panel Target',
    createdBy: 'usr_1',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

function createDataTransfer() {
  const data = new Map<string, string>();
  const dataTransfer = {
    dropEffect: 'none',
    effectAllowed: 'all',
    types: [] as string[],
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
      dataTransfer.types = [...data.keys()];
    }),
    getData: vi.fn((type: string) => data.get(type) ?? ''),
    clearData: vi.fn((type?: string) => {
      if (type) {
        data.delete(type);
      } else {
        data.clear();
      }
      dataTransfer.types = [...data.keys()];
    }),
  };

  return dataTransfer;
}

function ActiveVaultTree({ initialExpandedValue }: { initialExpandedValue: string[] }) {
  const [expandedValue, setExpandedValue] = useState(initialExpandedValue);

  return (
    <VaultSidebarTree
      vaults={[{ id: 'vlt_1', name: 'Personal' }]}
      activeVaultId="vlt_1"
      activeVaultRootOnly
      expandedValue={expandedValue}
      onExpandedValueChange={setExpandedValue}
      currentFolderId="fld_projects"
      folders={folders}
      documents={[]}
    />
  );
}

function NavigatingVaultTree() {
  const [expandedValue, setExpandedValue] = useState(['vault:vlt_1']);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  return (
    <>
      <button type="button" onClick={() => setCurrentFolderId('fld_projects')}>Open Projects</button>
      <VaultSidebarTree
        vaults={[{ id: 'vlt_1', name: 'Personal' }]}
        activeVaultId="vlt_1"
        activeVaultRootOnly
        expandedValue={expandedValue}
        onExpandedValueChange={setExpandedValue}
        currentFolderId={currentFolderId}
        folders={folders}
        documents={[]}
      />
    </>
  );
}

function DraggableVaultTree({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  const [expandedValue, setExpandedValue] = useState(['vault:vlt_1', 'folder:fld_projects']);

  return (
    <VaultSidebarTree
      vaults={[{ id: 'vlt_1', name: 'Personal' }]}
      activeVaultId="vlt_1"
      activeVaultRootOnly
      expandedValue={expandedValue}
      onExpandedValueChange={setExpandedValue}
      currentFolderId={null}
      folders={folders}
      documents={documents}
      canMoveItems
      onMoveItems={onMoveItems}
    />
  );
}

function PanelToTreeHarness({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  return (
    <VaultBrowserDragDropProvider>
      <PanelDragHandle />
      <DraggableVaultTree onMoveItems={onMoveItems} />
    </VaultBrowserDragDropProvider>
  );
}

function TreeToPanelFolderHarness({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  return (
    <VaultBrowserDragDropProvider>
      <DraggableVaultTree onMoveItems={vi.fn()} />
      <PanelFolderDropTarget onMoveItems={onMoveItems} />
    </VaultBrowserDragDropProvider>
  );
}

function TreeToPanelBreadcrumbHarness({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  return (
    <VaultBrowserDragDropProvider>
      <DraggableVaultTree onMoveItems={vi.fn()} />
      <PanelBreadcrumbDropTargets onMoveItems={onMoveItems} />
    </VaultBrowserDragDropProvider>
  );
}

function TreeToPanelSurfaceHarness({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  return (
    <VaultBrowserDragDropProvider>
      <DraggableVaultTree onMoveItems={vi.fn()} />
      <PanelCurrentFolderDropZone onMoveItems={onMoveItems} />
    </VaultBrowserDragDropProvider>
  );
}

function PanelDragHandle() {
  const {
    handleItemDragStart,
    handleItemDragEnd,
  } = useBrowserDragDrop({
    canUpdateItems: true,
    itemMutationPending: false,
    selectedItemKeys: new Set(),
    selectedItems: [],
    selectSingleItem: vi.fn(),
    folders,
    onMoveItems: vi.fn(),
  });

  return (
    <button
      type="button"
      draggable
      onDragStart={event => handleItemDragStart(event, panelDocumentItem)}
      onDragEnd={handleItemDragEnd}
    >
      Panel Budget.pdf
    </button>
  );
}

function PanelFolderDropTarget({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  const {
    dropTarget,
    draggedItemKeys,
    handleItemDragStart,
    handleItemDragEnd,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
  } = useBrowserDragDrop({
    canUpdateItems: true,
    itemMutationPending: false,
    selectedItemKeys: new Set(),
    selectedItems: [],
    selectSingleItem: vi.fn(),
    folders,
    onMoveItems,
  });

  return (
    <BrowserItemList
      items={[panelFolderItem]}
      vaultId="vlt_1"
      selectedItemKeys={new Set()}
      draggedItemKeys={draggedItemKeys}
      dropTarget={dropTarget}
      onOpenItem={vi.fn()}
      onSelectItem={vi.fn()}
      getItemActions={() => []}
      onDragStartItem={handleItemDragStart}
      onDragEndItem={handleItemDragEnd}
      onDragOverFolder={handleDragOverFolder}
      onDragLeaveFolder={handleDragLeaveFolder}
      onDropOnFolder={handleDropOnFolder}
      onOpenContextMenu={vi.fn()}
      onOpenBackgroundContextMenu={vi.fn()}
    />
  );
}

function PanelBreadcrumbDropTargets({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  const {
    dropTarget,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
  } = useBrowserDragDrop({
    canUpdateItems: true,
    itemMutationPending: false,
    selectedItemKeys: new Set(),
    selectedItems: [],
    selectSingleItem: vi.fn(),
    folders,
    onMoveItems,
  });

  return (
    <VaultRouteBreadcrumbs
      entries={[
        { key: 'root', label: 'Root', dropFolderId: null },
        { key: 'current', label: 'Current', dropFolderId: 'fld_projects' },
      ]}
      showFullLastLabel
      dropTarget={dropTarget}
      onDragOverFolder={handleDragOverFolder}
      onDragLeaveFolder={handleDragLeaveFolder}
      onDropOnFolder={handleDropOnFolder}
    />
  );
}

function PanelCurrentFolderDropZone({
  onMoveItems,
}: {
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  const {
    dropTarget,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
  } = useBrowserDragDrop({
    canUpdateItems: true,
    itemMutationPending: false,
    selectedItemKeys: new Set(),
    selectedItems: [],
    selectSingleItem: vi.fn(),
    folders,
    onMoveItems,
  });

  return (
    <BrowserCurrentFolderDropZone
      folderId="fld_projects"
      dropTarget={dropTarget}
      onDragOverFolder={handleDragOverFolder}
      onDragLeaveFolder={handleDragLeaveFolder}
      onDropOnFolder={handleDropOnFolder}
    >
      <div>Opened Test folder panel</div>
    </BrowserCurrentFolderDropZone>
  );
}

describe('vault sidebar tree', () => {
  it('keeps the active vault root expanded and allows the selected folder branch to collapse', async () => {
    const user = userEvent.setup();

    const { container } = await renderWithProviders(
      <ActiveVaultTree initialExpandedValue={['vault:vlt_1', 'folder:fld_projects']} />,
      { initialEntries: ['/vaults/vlt_1?folderId=fld_projects'], routePath: '/vaults/:vaultId' },
    );

    const root = container.querySelector('[data-part="branch"][data-value="vault:vlt_1"]');
    const rootControl = container.querySelector('[data-part="branch-control"][data-value="vault:vlt_1"]');
    const projects = container.querySelector('[data-part="branch"][data-value="folder:fld_projects"]');
    const projectsControl = container.querySelector('[data-part="branch-control"][data-value="folder:fld_projects"]');

    expect(root).toBeInstanceOf(HTMLElement);
    expect(rootControl).toBeInstanceOf(HTMLElement);
    expect(projects).toBeInstanceOf(HTMLElement);
    expect(projectsControl).toBeInstanceOf(HTMLElement);

    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(projects).toHaveAttribute('aria-expanded', 'true');

    await user.click(rootControl as HTMLElement);
    expect(root).toHaveAttribute('aria-expanded', 'true');

    await user.click(projectsControl as HTMLElement);

    await waitFor(() => {
      expect(projects).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('expands the current folder when navigation changes outside the tree', async () => {
    const user = userEvent.setup();

    const { container } = await renderWithProviders(
      <NavigatingVaultTree />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const projects = container.querySelector('[data-part="branch"][data-value="folder:fld_projects"]');
    const openProjects = container.querySelector('button');

    expect(projects).toBeInstanceOf(HTMLElement);
    expect(openProjects).toBeInstanceOf(HTMLButtonElement);
    expect(projects).toHaveAttribute('aria-expanded', 'false');

    await user.click(openProjects as HTMLButtonElement);

    await waitFor(() => {
      expect(projects).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('moves a dragged tree document onto a tree folder', async () => {
    const onMoveItems = vi.fn();

    const { container } = await renderWithProviders(
      <DraggableVaultTree onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const documentItem = container.querySelector('[data-part="item"][data-value="document:doc_budget"]');
    const projectsFolder = container.querySelector('[data-part="branch-control"][data-value="folder:fld_projects"]');
    const dataTransfer = createDataTransfer();

    expect(documentItem).toBeInstanceOf(HTMLElement);
    expect(projectsFolder).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(documentItem as HTMLElement, { dataTransfer });
    fireEvent.dragOver(projectsFolder as HTMLElement, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');

    fireEvent.drop(projectsFolder as HTMLElement, { dataTransfer });

    expect(onMoveItems).toHaveBeenCalledWith({
      targets: [
        expect.objectContaining({
          type: 'document',
          document: expect.objectContaining({ id: 'doc_budget' }),
        }),
      ],
      destinationId: 'fld_projects',
    });
  });

  it('moves a dragged tree folder onto the vault root target', async () => {
    const onMoveItems = vi.fn();

    const { container } = await renderWithProviders(
      <DraggableVaultTree onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const archiveFolder = container.querySelector('[data-part="item"][data-value="folder:fld_archive"]');
    const vaultRoot = container.querySelector('[data-part="branch-control"][data-value="vault:vlt_1"]');
    const dataTransfer = createDataTransfer();

    expect(archiveFolder).toBeInstanceOf(HTMLElement);
    expect(vaultRoot).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(archiveFolder as HTMLElement, { dataTransfer });
    fireEvent.dragOver(vaultRoot as HTMLElement, { dataTransfer });
    fireEvent.drop(vaultRoot as HTMLElement, { dataTransfer });

    expect(onMoveItems).toHaveBeenCalledWith({
      targets: [
        expect.objectContaining({
          type: 'folder',
          folder: expect.objectContaining({ id: 'fld_archive' }),
        }),
      ],
      destinationId: null,
    });
  });

  it('does not move a folder onto itself', async () => {
    const onMoveItems = vi.fn();

    const { container } = await renderWithProviders(
      <DraggableVaultTree onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const projectsFolder = container.querySelector('[data-part="branch-control"][data-value="folder:fld_projects"]');
    const dataTransfer = createDataTransfer();

    expect(projectsFolder).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(projectsFolder as HTMLElement, { dataTransfer });
    fireEvent.dragOver(projectsFolder as HTMLElement, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');

    fireEvent.drop(projectsFolder as HTMLElement, { dataTransfer });

    expect(onMoveItems).not.toHaveBeenCalled();
  });

  it('moves a dragged panel item onto a tree folder target', async () => {
    const onMoveItems = vi.fn();

    const { container } = await renderWithProviders(
      <PanelToTreeHarness onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const panelDocument = container.querySelector('button[draggable="true"]');
    const projectsFolder = container.querySelector('[data-part="branch-control"][data-value="folder:fld_projects"]');
    const dataTransfer = createDataTransfer();

    expect(panelDocument).toBeInstanceOf(HTMLButtonElement);
    expect(projectsFolder).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(panelDocument as HTMLButtonElement, { dataTransfer });
    fireEvent.dragOver(projectsFolder as HTMLElement, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');

    fireEvent.drop(projectsFolder as HTMLElement, { dataTransfer });

    expect(onMoveItems).toHaveBeenCalledWith({
      targets: [
        expect.objectContaining({
          type: 'document',
          document: expect.objectContaining({ id: 'doc_panel' }),
        }),
      ],
      destinationId: 'fld_projects',
    });
  });

  it('moves a dragged tree item onto a panel folder target', async () => {
    const onMoveItems = vi.fn();

    const { container } = await renderWithProviders(
      <TreeToPanelFolderHarness onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const treeDocument = container.querySelector('[data-part="item"][data-value="document:doc_budget"]');
    const panelFolder = container.querySelector('[role="option"][aria-label="Panel Target"]');
    const dataTransfer = createDataTransfer();

    expect(treeDocument).toBeInstanceOf(HTMLElement);
    expect(panelFolder).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(treeDocument as HTMLElement, { dataTransfer });
    fireEvent.dragOver(panelFolder as HTMLElement, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');

    fireEvent.drop(panelFolder as HTMLElement, { dataTransfer });

    expect(onMoveItems).toHaveBeenCalledWith({
      targets: [
        expect.objectContaining({
          type: 'document',
          document: expect.objectContaining({ id: 'doc_budget' }),
        }),
      ],
      destinationId: 'fld_panel',
    });
  });

  it('moves dragged tree items onto panel root and current-folder drop zones', async () => {
    const onMoveItems = vi.fn();

    const { container, getByText } = await renderWithProviders(
      <TreeToPanelBreadcrumbHarness onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const archiveFolder = container.querySelector('[data-part="item"][data-value="folder:fld_archive"]');
    const treeDocument = container.querySelector('[data-part="item"][data-value="document:doc_budget"]');
    const rootTarget = getByText('Root');
    const currentTarget = getByText('Current');
    const rootDataTransfer = createDataTransfer();
    const currentDataTransfer = createDataTransfer();

    expect(archiveFolder).toBeInstanceOf(HTMLElement);
    expect(treeDocument).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(archiveFolder as HTMLElement, { dataTransfer: rootDataTransfer });
    fireEvent.dragOver(rootTarget, { dataTransfer: rootDataTransfer });
    fireEvent.drop(rootTarget, { dataTransfer: rootDataTransfer });

    fireEvent.dragStart(treeDocument as HTMLElement, { dataTransfer: currentDataTransfer });
    fireEvent.dragOver(currentTarget, { dataTransfer: currentDataTransfer });
    fireEvent.drop(currentTarget, { dataTransfer: currentDataTransfer });

    expect(onMoveItems).toHaveBeenNthCalledWith(1, {
      targets: [
        expect.objectContaining({
          type: 'folder',
          folder: expect.objectContaining({ id: 'fld_archive' }),
        }),
      ],
      destinationId: null,
    });
    expect(onMoveItems).toHaveBeenNthCalledWith(2, {
      targets: [
        expect.objectContaining({
          type: 'document',
          document: expect.objectContaining({ id: 'doc_budget' }),
        }),
      ],
      destinationId: 'fld_projects',
    });
  });

  it('moves a dragged tree item onto the open panel surface', async () => {
    const onMoveItems = vi.fn();

    const { container, getByLabelText } = await renderWithProviders(
      <TreeToPanelSurfaceHarness onMoveItems={onMoveItems} />,
      { initialEntries: ['/vaults/vlt_1'], routePath: '/vaults/:vaultId' },
    );

    const treeDocument = container.querySelector('[data-part="item"][data-value="document:doc_budget"]');
    const panelSurface = getByLabelText('Current folder drop zone');
    const dataTransfer = createDataTransfer();

    expect(treeDocument).toBeInstanceOf(HTMLElement);

    fireEvent.dragStart(treeDocument as HTMLElement, { dataTransfer });
    fireEvent.dragOver(panelSurface, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');

    fireEvent.drop(panelSurface, { dataTransfer });

    expect(onMoveItems).toHaveBeenCalledWith({
      targets: [
        expect.objectContaining({
          type: 'document',
          document: expect.objectContaining({ id: 'doc_budget' }),
        }),
      ],
      destinationId: 'fld_projects',
    });
  });
});

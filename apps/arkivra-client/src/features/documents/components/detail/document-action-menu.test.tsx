import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Eye } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { DocumentActionMenu } from './document-action-menu';

describe('document action menu', () => {
  it('marks only the hovered document action active', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <DocumentActionMenu
        documentName="Budget.pdf"
        vaultId="vlt_1"
        documentId="doc_1"
        isDeleted={false}
        isTrashDocumentRoute={false}
        canPrint
        sectionMenuItems={[
          { key: 'preview', label: 'Preview', icon: Eye, route: 'preview' },
        ]}
        isRestorePending={false}
        isDeletePending={false}
        isRetryProcessingPending={false}
        canRetryProcessing={false}
        onNavigateToSection={vi.fn()}
        onPrint={vi.fn()}
        onOpenVersionsDialog={vi.fn()}
        onRestore={vi.fn()}
        onRetryProcessing={vi.fn()}
        onOpenDeleteDialog={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open actions for budget\.pdf/i }));

    const menu = screen.getByRole('menu');
    const versionsAction = within(menu).getByRole('menuitem', { name: /^versions$/i });
    const downloadAction = within(menu).getByRole('menuitem', { name: /^download$/i });
    const printAction = within(menu).getByRole('menuitem', { name: /^print$/i });
    const trashAction = within(menu).getByRole('menuitem', { name: /^trash$/i });

    await user.hover(printAction);
    expect(printAction).toHaveAttribute('data-active', 'true');
    expect(versionsAction).not.toHaveAttribute('data-active');
    expect(downloadAction).not.toHaveAttribute('data-active');
    expect(trashAction).not.toHaveAttribute('data-active');

    await user.hover(trashAction);
    expect(trashAction).toHaveAttribute('data-active', 'true');
    expect(printAction).not.toHaveAttribute('data-active');
  });
});

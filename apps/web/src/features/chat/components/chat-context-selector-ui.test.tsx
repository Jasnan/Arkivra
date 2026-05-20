import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { ContextChipList } from './chat-context-selector';

describe('context chip list', () => {
  it('always renders compact summary details for small context', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <ContextChipList
        locked={false}
        context={{
          vaults: [{ vaultId: 'vlt_1', name: 'Tax Documents' }],
          documents: [{ vaultId: 'vlt_2', documentId: 'doc_2018', name: 'bescheid_2018.pdf' }],
        }}
        onRemoveVault={vi.fn()}
        onRemoveDocument={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/active conversation context/i)).toHaveTextContent(
      '1 vault and 1 individual file attached',
    );
    expect(screen.queryByText('Tax Documents')).not.toBeInTheDocument();
    expect(screen.queryByText('bescheid_2018.pdf')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view all/i }));

    expect(await screen.findByRole('dialog', { name: /conversation context/i })).toBeInTheDocument();
    expect(screen.getByText('Tax Documents')).toBeInTheDocument();
    expect(screen.getByText('bescheid_2018.pdf')).toBeInTheDocument();
  });

  it('renders large context as a compact summary with details', async () => {
    const user = userEvent.setup();
    const onRemoveVault = vi.fn();
    const onRemoveDocument = vi.fn();

    await renderWithProviders(
      <ContextChipList
        locked={false}
        context={{
          vaults: [
            { vaultId: 'vlt_1', name: 'Tax Documents' },
            { vaultId: 'vlt_2', name: 'Client Documents' },
          ],
          documents: [
            { vaultId: 'vlt_3', documentId: 'doc_2018', name: 'bescheid_2018.pdf', vaultName: 'Archive' },
            { vaultId: 'vlt_4', documentId: 'doc_2019', name: 'bescheid_2019.pdf', vaultName: 'Archive' },
            { vaultId: 'vlt_5', documentId: 'doc_2020', name: 'bescheid_2020.pdf', vaultName: 'Archive' },
          ],
        }}
        onRemoveVault={onRemoveVault}
        onRemoveDocument={onRemoveDocument}
      />,
    );

    expect(screen.getByLabelText(/active conversation context/i)).toHaveTextContent(
      '2 vaults and 3 individual files attached',
    );
    expect(screen.queryByText('bescheid_2018.pdf')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /view all/i }));

    expect(await screen.findByRole('dialog', { name: /conversation context/i })).toBeInTheDocument();
    expect(screen.getByText('Vaults')).toBeInTheDocument();
    expect(screen.getByText('Individual files')).toBeInTheDocument();
    expect(screen.getByText('Tax Documents')).toBeInTheDocument();
    expect(screen.getByText('bescheid_2018.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove bescheid_2018.pdf from context/i }));
    expect(onRemoveDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc_2018' }));
  });

  it('communicates locked context in the compact summary', async () => {
    await renderWithProviders(
      <ContextChipList
        locked
        context={{
          vaults: [{ vaultId: 'vlt_1', name: 'Tax Documents' }],
          documents: [
            { vaultId: 'vlt_2', documentId: 'doc_1', name: 'one.pdf' },
            { vaultId: 'vlt_3', documentId: 'doc_2', name: 'two.pdf' },
            { vaultId: 'vlt_4', documentId: 'doc_3', name: 'three.pdf' },
            { vaultId: 'vlt_5', documentId: 'doc_4', name: 'four.pdf' },
          ],
        }}
        onRemoveVault={vi.fn()}
        onRemoveDocument={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/active conversation context/i)).toHaveTextContent(
      '1 vault and 4 individual files attached',
    );
  });

  it('disables the context details button when context controls are disabled', async () => {
    await renderWithProviders(
      <ContextChipList
        locked={false}
        disabled
        context={{
          vaults: [{ vaultId: 'vlt_1', name: 'Tax Documents' }],
          documents: [],
        }}
        onRemoveVault={vi.fn()}
        onRemoveDocument={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /view all/i })).toBeDisabled();
  });
});

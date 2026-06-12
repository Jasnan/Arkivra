import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { Citation } from '../chat.types';
import { SourcesAccordion } from './sources-accordion';

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    chunkId: 'chk_1',
    documentId: 'doc_1',
    vaultId: 'vlt_1',
    vaultName: 'Policy',
    documentName: 'Policy.pdf',
    mimeType: 'application/pdf',
    pageStart: 1,
    pageEnd: 1,
    section: null,
    snippet: 'Matched policy text',
    boundingBoxes: [],
    citationPrecision: 'page',
    assetType: 'text',
    tablesHtml: [],
    imageAssetIds: [],
    score: 0.8,
    ...overrides,
  };
}

describe('sources accordion', () => {
  it('closes citation previews without leaving the page inert', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion currentVaultId="vlt_1" citations={[citation()]} />,
    );

    await user.click(screen.getByRole('button', { name: /sources/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    document.body.setAttribute('data-inert', '');
    document.body.setAttribute('data-scroll-lock', '');
    await user.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body).not.toHaveAttribute('data-inert');
      expect(document.body).not.toHaveAttribute('data-scroll-lock');
    });

    await user.click(screen.getByRole('button', { name: /sources/i }));
    expect(screen.getByRole('button', { name: /page 1/i })).toBeInTheDocument();
  });

  it('uses the original file endpoint for WebP citation previews', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            documentName: 'back_page_passport.webp',
            mimeType: 'image/webp',
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /sources/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    expect(
      await screen.findByRole('img', { name: /back_page_passport\.webp page 1/i }),
    ).toHaveAttribute('src', '/api/vaults/vlt_1/documents/doc_1/file');
  });

  it('uses the original file endpoint for legacy WebP citations without MIME metadata', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            documentName: 'back_page_passport.webp',
            mimeType: undefined,
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /sources/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    expect(
      await screen.findByRole('img', { name: /back_page_passport\.webp page 1/i }),
    ).toHaveAttribute('src', '/api/vaults/vlt_1/documents/doc_1/file');
  });
});

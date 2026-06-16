import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    document.body.setAttribute('data-inert', '');
    document.body.setAttribute('inert', '');
    document.body.setAttribute('data-scroll-lock', '');
    document.body.style.pointerEvents = 'none';
    await user.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body).not.toHaveAttribute('data-inert');
      expect(document.body).not.toHaveAttribute('inert');
      expect(document.body).not.toHaveAttribute('data-scroll-lock');
      expect(document.body.style.pointerEvents).toBe('');
    });

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
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

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    expect(
      await screen.findByRole('img', { name: /back_page_passport\.webp page 1/i }),
    ).toHaveAttribute('src', '/api/vaults/vlt_1/documents/doc_1/file');
  });

  it('does not render page navigation controls inside the citation preview', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            pageStart: 1,
            pageEnd: 2,
            boundingBoxes: [
              {
                pageNumber: 2,
                x0: 10,
                y0: 10,
                x1: 20,
                y1: 20,
                layoutWidth: 100,
                layoutHeight: 100,
                system: 'PixelSpace',
              },
            ],
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /pages 1-2/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /^page 1$/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^page 2$/i })).not.toBeInTheDocument();
  });

  it('renders citation bounding boxes after the preview image loads', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            boundingBoxes: [
              {
                pageNumber: 1,
                x0: 10,
                y0: 20,
                x1: 30,
                y1: 50,
                layoutWidth: 100,
                layoutHeight: 100,
                system: 'PixelSpace',
              },
              {
                pageNumber: 1,
                x0: 32,
                y0: 20,
                x1: 50,
                y1: 60,
                layoutWidth: 100,
                layoutHeight: 100,
                system: 'PixelSpace',
              },
            ],
            citationPrecision: 'box',
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    const image = await screen.findByRole('img', { name: /policy\.pdf page 1/i });
    Object.defineProperty(image, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(image, 'clientHeight', { configurable: true, value: 700 });
    fireEvent.load(image);

    expect(await screen.findAllByTestId('citation-bounding-box')).toHaveLength(1);
    expect(await screen.findByTestId('citation-bounding-box')).toHaveStyle({
      left: '50px',
      top: '140px',
      width: '200px',
      height: '280px',
    });
  });

  it('does not render a page-wide outline for legacy zero-area citation boxes', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            boundingBoxes: [
              {
                pageNumber: 1,
                x0: 0,
                y0: 0,
                x1: 0,
                y1: 0,
                layoutWidth: 595,
                layoutHeight: 842,
                system: 'PixelSpace',
              },
            ],
            citationPrecision: 'box',
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    const image = await screen.findByRole('img', { name: /policy\.pdf page 1/i });
    Object.defineProperty(image, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(image, 'clientHeight', { configurable: true, value: 700 });
    fireEvent.load(image);

    await waitFor(() => {
      expect(screen.queryByTestId('citation-page-outline')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('citation-bounding-box')).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    expect(
      await screen.findByRole('img', { name: /back_page_passport\.webp page 1/i }),
    ).toHaveAttribute('src', '/api/vaults/vlt_1/documents/doc_1/file');
  });

  it('omits citation details from the citation preview side panel', async () => {
    const user = userEvent.setup();

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            section: 'Eligibility',
            sourceElementIds: ['#/texts/1'],
            tableSourceElementIds: ['#/tables/1'],
            imageAssets: [
              {
                assetId: 'asset_1',
                sourceElementId: '#/pictures/1',
                caption: 'Scanned approval form',
                pageNumber: 1,
              },
            ],
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /page 1/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).queryByText('Matched policy text')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Section')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Eligibility')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Figure evidence')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Source details')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Citation precision')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Matched text')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Docling provenance')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Chunk elements')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Table elements')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Image elements')).not.toBeInTheDocument();
  });
});

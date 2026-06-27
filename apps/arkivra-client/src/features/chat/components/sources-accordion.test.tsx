import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain' },
  });
}

function stubCitationPreviewFetch({
  fileText,
  content = fileText,
  documentName = 'notes.txt',
  mimeType = 'text/plain',
}: {
  fileText: string;
  content?: string;
  documentName?: string;
  mimeType?: string;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/vaults/vlt_1/documents/doc_1/file') {
        return textResponse(fileText);
      }

      if (url === '/api/vaults/vlt_1/documents/doc_1') {
        return jsonResponse({
          document: {
            id: 'doc_1',
            name: documentName,
            originalName: documentName,
            folderId: null,
            originalSize: fileText.length,
            originalSha256Hash: 'sha256',
            mimeType,
            processingStatus: 'completed',
            content,
            createdBy: 'usr_1',
            language: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            isDeleted: false,
            deletedAt: null,
          },
        });
      }

      return jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404);
    }),
  );
}

const originalPrototypeDescriptors = {
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  scrollLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft'),
  scrollTo: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo'),
  scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
};

function restorePrototypeProperty(
  property: keyof typeof originalPrototypeDescriptors,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, property);
    return;
  }

  Object.defineProperty(HTMLElement.prototype, property, descriptor);
}

describe('sources accordion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [property, descriptor] of Object.entries(originalPrototypeDescriptors)) {
      restorePrototypeProperty(
        property as keyof typeof originalPrototypeDescriptors,
        descriptor,
      );
    }
    vi.unstubAllGlobals();
  });

  it('closes citation previews without leaving the page inert', async () => {
    const user = userEvent.setup();

    await renderWithProviders(<SourcesAccordion currentVaultId="vlt_1" citations={[citation()]} />);

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

    const boundingBoxes = await screen.findAllByTestId('citation-bounding-box');
    expect(boundingBoxes).toHaveLength(2);
    expect(boundingBoxes[0]).toHaveStyle({
      left: '50px',
      top: '140px',
      width: '100px',
      height: '210px',
    });
    expect(boundingBoxes[1]).toHaveStyle({
      left: '160px',
      top: '140px',
      width: '90px',
      height: '280px',
    });
  });

  it('scrolls to and pulses the first citation bounding box after render', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    const getBoundingClientRectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: Element) {
        const testId = this.getAttribute('data-testid');

        if (testId === 'citation-preview-scroll-container') {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 500,
            bottom: 400,
            left: 0,
            width: 500,
            height: 400,
            toJSON: () => ({}),
          };
        }

        if (testId === 'citation-bounding-box') {
          return {
            x: 100,
            y: 900,
            top: 900,
            right: 220,
            bottom: 940,
            left: 100,
            width: 120,
            height: 40,
            toJSON: () => ({}),
          };
        }

        return {
          x: 0,
          y: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'citation-preview-scroll-container' ? 400 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'citation-preview-scroll-container' ? 500 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
      configurable: true,
      get() {
        return 0;
      },
    });

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            boundingBoxes: [
              {
                pageNumber: 1,
                x0: 10,
                y0: 86,
                x1: 30,
                y1: 90,
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
    Object.defineProperty(image, 'clientHeight', { configurable: true, value: 1000 });
    fireEvent.load(image);

    const boundingBox = await screen.findByTestId('citation-bounding-box');
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: 'smooth',
          top: 720,
        }),
      );
      expect(boundingBox).toHaveAttribute('data-citation-pulsing', 'true');
    });
    expect(getBoundingClientRectSpy).toHaveBeenCalled();
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

  it('renders and highlights plain text citation previews', async () => {
    const user = userEvent.setup();
    const fileText = [
      'First sentence in the notes.',
      'The renewal notice must be sent',
      'within 30 days of approval.',
      'Final sentence.',
    ].join('\n');
    const textStartOffset = fileText.indexOf('The renewal notice');
    const textEndOffset = fileText.indexOf('Final sentence.') - 1;
    stubCitationPreviewFetch({ fileText });

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            documentName: 'notes.txt',
            mimeType: 'text/plain',
            pageStart: null,
            pageEnd: null,
            snippet: 'The renewal notice must be sent within 30 days of approval.',
            citationPrecision: 'document',
            textLocator: {
              sourceType: 'rawText',
              startOffset: textStartOffset,
              endOffset: textEndOffset,
            },
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /document/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/first sentence in the notes/i)).toBeInTheDocument();
    expect(await within(dialog).findByTestId('citation-text-highlight')).toHaveTextContent(
      /The renewal notice must be sent\s+within 30 days of approval\./,
    );
  });

  it('does not highlight text citation previews without backend offsets', async () => {
    const user = userEvent.setup();
    const fileText = [
      'First sentence in the notes.',
      'The renewal notice must be sent',
      'within 30 days of approval.',
      'Final sentence.',
    ].join('\n');
    stubCitationPreviewFetch({ fileText });

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            documentName: 'notes.txt',
            mimeType: 'text/plain',
            pageStart: null,
            pageEnd: null,
            snippet: 'The renewal notice must be sent within 30 days of approval.',
            citationPrecision: 'document',
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /document/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/first sentence in the notes/i)).toBeInTheDocument();
    expect(within(dialog).queryByTestId('citation-text-highlight')).not.toBeInTheDocument();
  });

  it('renders and highlights Markdown citation previews', async () => {
    const user = userEvent.setup();
    const fileText = [
      '# Renewal policy',
      '',
      'Global chat requires at least one `full` AI-authorized vault:',
      '',
      '1. Give member `full` AI access on one vault.',
      '2. Go to `/chat`.',
      '3. Expected: global chat is available.',
      '4. Remove `full` from all vaults, or set all to `none` / `document_chat`.',
      '5. Refresh `/chat`.',
      '6. Expected: global chat is blocked or explains that full AI access is required.',
    ].join('\n');
    const textStartOffset = fileText.indexOf('1. Give member');
    const textEndOffset = fileText.length;
    stubCitationPreviewFetch({
      fileText,
      documentName: 'policy.md',
      mimeType: 'text/markdown',
    });

    await renderWithProviders(
      <SourcesAccordion
        currentVaultId="vlt_1"
        citations={[
          citation({
            documentName: 'policy.md',
            mimeType: 'text/markdown',
            pageStart: null,
            pageEnd: null,
            snippet:
              '1. Give member `full` AI access on one vault. 2. Go to `/chat` . 3. Expected: global chat is available. 4. Remove `full` from all vaults, or set all to `none` / `document_chat` . 5. Refresh `/chat` . 6. Expected: global chat is blocked or explains that full AI access is required.',
            citationPrecision: 'document',
            textLocator: {
              sourceType: 'rawMarkdown',
              startOffset: textStartOffset,
              endOffset: textEndOffset,
            },
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cited passages/i }));
    await user.click(screen.getByRole('button', { name: /document/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/# Renewal policy/i)).toBeInTheDocument();
    const highlights = await within(dialog).findAllByTestId('citation-text-highlight');
    expect(highlights.map((highlight) => highlight.textContent).join('')).toBe(
      fileText.slice(textStartOffset, textEndOffset),
    );
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

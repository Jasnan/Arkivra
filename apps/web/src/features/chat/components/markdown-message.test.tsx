import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { Citation } from '../chat.types';
import { MarkdownMessage, projectInlineCitationsForDisplay } from './markdown-message';

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    chunkId: 'chk_1',
    documentId: 'doc_1',
    vaultId: 'vlt_1',
    vaultName: 'Identity',
    documentName: 'Passport.pdf',
    mimeType: 'application/pdf',
    pageStart: 1,
    pageEnd: 1,
    section: null,
    snippet: 'Passport No: K1234567',
    boundingBoxes: [],
    citationPrecision: 'page',
    assetType: 'text',
    tablesHtml: [],
    imageAssetIds: [],
    score: 0.8,
    ...overrides,
  };
}

describe('markdown message citations', () => {
  it('orders display citations by first inline marker use', () => {
    const result = projectInlineCitationsForDisplay({
      content: 'The renewal improved.[4] The margin stayed flat.[2] Renewal repeated.[4]',
      citations: [
        citation({ chunkId: 'chk_1', snippet: 'Unused first passage' }),
        citation({ chunkId: 'chk_2', snippet: 'Margin passage' }),
        citation({ chunkId: 'chk_3', snippet: 'Unused third passage' }),
        citation({ chunkId: 'chk_4', snippet: 'Renewal passage' }),
      ],
    });

    expect(result.content).toBe(
      'The renewal improved.[1] The margin stayed flat.[2] Renewal repeated.[1]',
    );
    expect(result.citations.map((item) => item.chunkId)).toEqual(['chk_4', 'chk_2']);
  });

  it('leaves invalid markers as text and omits uncited passages', () => {
    const result = projectInlineCitationsForDisplay({
      content: 'The answer cites one passage.[2] Page-style text [99] stays unchanged.',
      citations: [
        citation({ chunkId: 'chk_1', snippet: 'Unused passage' }),
        citation({ chunkId: 'chk_2', snippet: 'Used passage' }),
      ],
    });

    expect(result.content).toBe('The answer cites one passage.[1] Page-style text [99] stays unchanged.');
    expect(result.citations.map((item) => item.chunkId)).toEqual(['chk_2']);
  });

  it('shows citation excerpts as a quick preview on the inline marker', async () => {
    const user = userEvent.setup();
    const onCitationClick = vi.fn();

    await renderWithProviders(
      <MarkdownMessage
        content="Passport number is K1234567.[1]"
        citations={[citation()]}
        onCitationClick={onCitationClick}
      />,
    );

    const marker = screen.getByRole('button', { name: '[1]' });
    await user.hover(marker);

    expect(await screen.findByText('Passport.pdf')).toBeInTheDocument();
    expect(await screen.findByText('Page 1')).toBeInTheDocument();
    expect(await screen.findByText('Passport No: K1234567')).toBeInTheDocument();

    await user.click(marker);
    expect(onCitationClick).toHaveBeenCalledWith(expect.objectContaining({ chunkId: 'chk_1' }));
  });
});

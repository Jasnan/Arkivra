import { describe, expect, test } from 'vitest';
import { createNoopTextCleaner } from './text-cleaner.js';

describe('text-cleaner / noop', () => {
  test('returns parser text and markdown unchanged', async () => {
    const cleaner = createNoopTextCleaner();
    const input = {
      text: 'Of\uFB01cial  certi-\nficate.Issued today.',
      markdown: '# Raw  markdown\n\n２０２６',
    };

    await expect(cleaner.clean(input)).resolves.toEqual(input);
  });
});

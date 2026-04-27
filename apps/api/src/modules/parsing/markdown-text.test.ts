import { describe, expect, test } from 'vitest';
import { markdownToPlainText } from './markdown-text.js';

describe('markdown text helpers', () => {
  test('converts markdown into plain text', () => {
    const output = markdownToPlainText([
      '# Heading',
      '',
      '- **Important** [link](https://example.com)',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n'));

    expect(output).toContain('Heading');
    expect(output).toContain('Important link');
    expect(output).toContain('A   B');
    expect(output).not.toContain('**');
    expect(output).not.toContain('https://example.com');
  });
});

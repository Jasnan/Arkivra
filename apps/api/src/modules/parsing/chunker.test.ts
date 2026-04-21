import { describe, expect, test } from 'vitest';
import { chunkMarkdown } from './chunker.js';

describe('chunkMarkdown', () => {
  test('returns empty array for empty / whitespace-only input', () => {
    expect(chunkMarkdown('', { documentId: 'doc_1' })).toEqual([]);
    expect(chunkMarkdown('   \n   ', { documentId: 'doc_1' })).toEqual([]);
  });

  test('produces deterministic ids scoped to documentId', () => {
    const md = '# Intro\nSome text.\n\n## Next\nMore text.';
    const chunks = chunkMarkdown(md, { documentId: 'doc_42' });

    expect(chunks.length).toBeGreaterThan(0);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.id).toBe(`doc_42:${i}`);
    }
  });

  test('captures section from nearest preceding heading', () => {
    const md = `# Introduction
This is the introduction.

## Results
Experimental results here.`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    expect(chunks[0]!.section).toBe('Introduction');
    // Results section may span one or more chunks
    const resultsChunks = chunks.filter((c) => c.section === 'Results');
    expect(resultsChunks.length).toBeGreaterThan(0);
  });

  test('constrains chunk.type to the bounded enum', () => {
    const md = `# Intro
First paragraph.

- list item 1
- list item 2

| a | b |
| - | - |
| 1 | 2 |`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    for (const chunk of chunks) {
      expect(['heading', 'paragraph', 'table', 'list', 'other']).toContain(chunk.type);
    }
  });

  test('splits oversized sections into multiple chunks', () => {
    const longText = 'This is a sentence. '.repeat(300);
    const chunks = chunkMarkdown(longText, {
      documentId: 'd',
      maxChunkChars: 500,
      overlapChars: 50,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  test('stores index and token count in metadata', () => {
    const chunks = chunkMarkdown('Hello world.', { documentId: 'd' });
    expect(chunks[0]!.metadata.index).toBe(0);
    expect(typeof chunks[0]!.metadata.tokenCount).toBe('number');
    expect(chunks[0]!.metadata.tokenCount).toBeGreaterThan(0);
  });

  test('pageNumber is null when not provided', () => {
    const chunks = chunkMarkdown('# Title\nBody.', { documentId: 'd' });
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBeNull();
    }
  });

  test('creates single chunk for short content', () => {
    const chunks = chunkMarkdown('Hello world, this is a test document.', {
      documentId: 'd',
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.id).toBe('d:0');
    expect(chunks[0]!.text).toBe('Hello world, this is a test document.');
    expect(chunks[0]!.type).toBe('paragraph');
    expect(chunks[0]!.section).toBeNull();
  });

  test('splits markdown by headings into multiple chunks', () => {
    const md = `# Introduction
This is the intro.

## Chapter 1
Content of chapter 1.

## Chapter 2
Content of chapter 2.`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some((c) => c.text.includes('Introduction'))).toBe(true);
    expect(chunks.some((c) => c.text.includes('Chapter 1'))).toBe(true);
    expect(chunks.some((c) => c.text.includes('Chapter 2'))).toBe(true);
  });

  test('preserves code blocks within chunks', () => {
    const md = `## Code Example

Here is some code:

\`\`\`javascript
function hello() {
  console.log("hello");
}
\`\`\`

That was the code.`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const allContent = chunks.map((c) => c.text).join('\n');
    expect(allContent).toContain('console.log');
  });
});

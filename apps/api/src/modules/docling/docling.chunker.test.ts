import { describe, expect, test } from 'vitest';
import { chunkMarkdownContent } from './docling.chunker.js';

describe('chunkMarkdownContent', () => {
  test('returns empty array for empty string', () => {
    expect(chunkMarkdownContent('')).toEqual([]);
  });

  test('returns empty array for whitespace-only string', () => {
    expect(chunkMarkdownContent('   \n  \n  ')).toEqual([]);
  });

  test('creates single chunk for short content', () => {
    const chunks = chunkMarkdownContent('Hello world, this is a test document.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.content).toBe('Hello world, this is a test document.');
    expect(chunks[0]!.chunkType).toBe('text');
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  test('splits markdown by headings into sections', () => {
    const md = `# Introduction
This is the intro.

## Chapter 1
Content of chapter 1.

## Chapter 2
Content of chapter 2.`;

    const chunks = chunkMarkdownContent(md);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0]!.content).toContain('Introduction');
    expect(chunks[1]!.content).toContain('Chapter 1');
    expect(chunks[2]!.content).toContain('Chapter 2');
  });

  test('assigns sequential chunk indices', () => {
    const md = `# A
Text A

## B
Text B

## C
Text C`;

    const chunks = chunkMarkdownContent(md);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.chunkIndex).toBe(i);
    }
  });

  test('splits large sections exceeding max chunk size', () => {
    // Create content larger than MAX_CHUNK_CHARS (2000)
    const longText = 'This is a sentence that repeats. '.repeat(200);
    const chunks = chunkMarkdownContent(longText);
    expect(chunks.length).toBeGreaterThan(1);

    // All chunks should have content
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  test('estimates token count for each chunk', () => {
    const chunks = chunkMarkdownContent('Hello world, this is a short test.');
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
    // ~34 chars / 4 ≈ 9 tokens
    expect(chunks[0]!.tokenCount).toBeLessThan(20);
  });

  test('handles markdown with code blocks', () => {
    const md = `## Code Example

Here is some code:

\`\`\`javascript
function hello() {
  console.log("hello");
}
\`\`\`

That was the code.`;

    const chunks = chunkMarkdownContent(md);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Code block content should be preserved
    const allContent = chunks.map(c => c.content).join('\n');
    expect(allContent).toContain('console.log');
  });
});

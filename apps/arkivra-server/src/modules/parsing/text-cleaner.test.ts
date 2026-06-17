import { describe, expect, test } from 'vitest';
import {
  __testing,
  createDeterministicTextCleaner,
  createNoopTextCleaner,
} from './text-cleaner.js';

const {
  cleanPlainText,
  cleanMarkdown,
  replaceLigatures,
  joinHyphenatedLineBreaks,
  spaceAfterSentencePunctuation,
  collapseInlineWhitespace,
  collapseBlankLines,
} = __testing;

describe('text-cleaner / rules', () => {
  test('replaces common OCR ligatures', () => {
    expect(replaceLigatures('of\uFB01cial certi\uFB01cate')).toBe('official certificate');
    expect(replaceLigatures('\uFB00ag \uFB02ight')).toBe('ffag flight');
  });

  test('joins hyphenated line breaks', () => {
    expect(joinHyphenatedLineBreaks('certi-\nficate')).toBe('certificate');
    expect(joinHyphenatedLineBreaks('multi-\nword\ntext')).toBe('multiword\ntext');
  });

  test('adds a space after sentence punctuation joined to an uppercase word', () => {
    expect(spaceAfterSentencePunctuation('endHere.Starts now')).toBe('endHere. Starts now');
    expect(spaceAfterSentencePunctuation('foo,Bar and baz')).toBe('foo, Bar and baz');
  });

  test('does not touch acronyms (no preceding lowercase letter)', () => {
    // U.S.A. shouldn't get extra spaces because each period is preceded by an
    // uppercase letter, not a lowercase one.
    expect(spaceAfterSentencePunctuation('U.S.A.')).toBe('U.S.A.');
  });

  test('collapses runs of spaces and tabs but preserves newlines', () => {
    expect(collapseInlineWhitespace('a     b\t\tc\nd  e')).toBe('a b c\nd e');
  });

  test('collapses 3+ blank lines to a single blank line', () => {
    expect(collapseBlankLines('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('text-cleaner / deterministic', () => {
  test('performs the full deterministic cleanup on plain text', async () => {
    const cleaner = createDeterministicTextCleaner();
    const input = {
      text: 'Of\uFB01cial  certi-\nficate.Issued today.',
      markdown: '',
    };

    const { text } = await cleaner.clean(input);
    expect(text).toBe('Official certificate. Issued today.');
  });

  test('preserves fenced code blocks verbatim', async () => {
    const cleaner = createDeterministicTextCleaner();
    const input = {
      text: '',
      markdown: '# Title\n\nBefore.\n\n```ts\nconst   x   =   1;\n```\n\nAfter.',
    };

    const { markdown } = await cleaner.clean(input);
    expect(markdown).toContain('```ts\nconst   x   =   1;\n```');
    expect(markdown).toContain('Before.');
    expect(markdown).toContain('After.');
  });

  test('normalizes unicode via NFKC', async () => {
    // Half-width and full-width digits should fold together.
    const cleaner = createDeterministicTextCleaner();
    const { text } = await cleaner.clean({ text: '２０２６', markdown: '' });
    expect(text).toBe('2026');
  });

  test('is safe on empty input', async () => {
    const cleaner = createDeterministicTextCleaner();
    const out = await cleaner.clean({ text: '', markdown: '' });
    expect(out).toEqual({ text: '', markdown: '' });
  });

  test('noop cleaner returns input unchanged', async () => {
    const cleaner = createNoopTextCleaner();
    const input = { text: 'raw  text', markdown: 'raw  md' };
    const out = await cleaner.clean(input);
    expect(out).toEqual(input);
  });

  test('cleanPlainText trims surrounding whitespace', () => {
    expect(cleanPlainText('   padded content   ')).toBe('padded content');
  });

  test('cleanMarkdown preserves leading indent inside code fences', () => {
    const md = '```\n    indented\n```\n';
    expect(cleanMarkdown(md)).toContain('    indented');
  });
});

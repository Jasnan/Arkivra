import { describe, expect, test, vi } from 'vitest';
import {
  __testing,
  createNoopGluedWordNormalizer,
  createOllamaGluedWordNormalizer,
} from './glued-word-normalizer.js';

const {
  applyReplacements,
  collectLineCandidates,
  extractDigits,
  extractJsonObject,
  hasLongAllCapsRun,
  hasSuspiciousWordBoundaryPattern,
  isSuspiciousLine,
  removeWhitespace,
  splitMarkdownLine,
  validateDigitPreservingNormalization,
} = __testing;

describe('glued-word normalizer helpers', () => {
  test('collects suspicious OCR lines instead of single tokens only', () => {
    const candidates = collectLineCandidates({
      value: [
        'Certificate No.6157/2013',
        'Thisis tocertify that thefollowing information has.beentakenfromtheRegisterof Marriages(Common)maintained inFormNo. IIIintheOfficeoftheLocalRegistrarofAnakkayamGramaPanchayat',
        '# Markdown heading should be ignored',
      ].join('\n'),
      minTokenLength: 8,
      maxCandidates: 10,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.original).toBe(
      'Thisis tocertify that thefollowing information has.beentakenfromtheRegisterof Marriages(Common)maintained inFormNo. IIIintheOfficeoftheLocalRegistrarofAnakkayamGramaPanchayat',
    );
    expect(candidates[0]?.snippet).toBe(
      'Thisis tocertify that thefollowing information has.beentakenfromtheRegisterof Marriages(Common)maintained inFormNo. IIIintheOfficeoftheLocalRegistrarofAnakkayamGramaPanchayat',
    );
  });

  test('extracts markdown prefixes while preserving visible content', () => {
    expect(splitMarkdownLine('# GOVERNMENTOFKERALA')).toEqual({
      prefix: '# ',
      content: 'GOVERNMENTOFKERALA',
      isStructured: true,
    });
  });

  test('detects suspicious glued word-boundary patterns', () => {
    expect(hasSuspiciousWordBoundaryPattern('theRegistrationofMarriages(Common)Rules')).toBe(true);
    expect(hasSuspiciousWordBoundaryPattern('clean normal sentence')).toBe(false);
  });

  test('detects long all-caps OCR runs without flagging normal title case words', () => {
    expect(hasLongAllCapsRun('Issued by GOVERNMENTOFKERALA', 8)).toBe(true);
    expect(hasLongAllCapsRun('Certificate No.6157/2013', 8)).toBe(false);
  });

  test('ignores normal prose lines', () => {
    expect(isSuspiciousLine('This is a clean normal sentence.', 8)).toBe(false);
  });

  test('allows non-numeric OCR corrections when digits stay unchanged', () => {
    expect(validateDigitPreservingNormalization({
      original: 'Thisis tocertify underrule11(1)oftheRules',
      updated: 'This is to certify under rule 11(1) of the Rules',
    })).toBe('This is to certify under rule 11(1) of the Rules');
  });

  test('rejects outputs that change numeric content', () => {
    expect(validateDigitPreservingNormalization({
      original: 'CertificateNo.6157/2013 dated06/02/2023',
      updated: 'Certificate No. 6157/2018 dated 06/02/2023',
    })).toBeNull();
  });

  test('accepts outputs that only rearrange whitespace', () => {
    expect(validateDigitPreservingNormalization({
      original: 'Thisis tocertify that thefollowing',
      updated: 'This is to certify that the following',
    })).toBe('This is to certify that the following');
  });

  test('extracts digit groups for immutable numeric validation', () => {
    expect(extractDigits('rule11(1) dated06/02/2023')).toEqual(['11', '1', '06', '02', '2023']);
  });

  test('removes whitespace for structural equality checks', () => {
    expect(removeWhitespace('This is\n to certify')).toBe('Thisistocertify');
  });

  test('applies exact line replacements to text', () => {
    const updated = applyReplacements(
      'A\nThisis tocertify that thefollowing\nB',
      [{
        original: 'Thisis tocertify that thefollowing',
        updated: 'This is to certify that the following',
      }],
    );

    expect(updated).toBe('A\nThis is to certify that the following\nB');
  });

  test('extracts a JSON object from fenced model output', () => {
    expect(extractJsonObject('```json\n{"output":"A B"}\n```')).toBe('{"output":"A B"}');
  });
});

describe('glued-word normalizer', () => {
  test('noop normalizer leaves input unchanged', async () => {
    const normalizer = createNoopGluedWordNormalizer();
    const result = await normalizer.normalize({
      text: 'GOVERNMENTOFKERALA',
      markdown: 'GOVERNMENTOFKERALA',
    });

    expect(result).toEqual({
      text: 'GOVERNMENTOFKERALA',
      markdown: 'GOVERNMENTOFKERALA',
      replacements: [],
    });
  });

  test('uses ollama decisions to normalize suspicious OCR lines in text and markdown', async () => {
    const inputLine = 'Thisis tocertify that thefollowing information has.beentakenfromtheRegisterof Marriages(Common)maintained inFormNo. IIIintheOfficeoftheLocalRegistrarofAnakkayamGramaPanchayat';
    const outputLine = 'This is to certify that the following information has.been taken from the Register of Marriages(Common) maintained in FormNo. III in the Office of the Local Registrar of Anakkayam Grama Panchayat';
    const chat = vi.fn(async () => ({
      message: {
        content: JSON.stringify({
          output: outputLine,
        }),
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma3n:e4b',
      minTokenLength: 8,
      chat,
    });

    const result = await normalizer.normalize({
      text: `Certificate No.6157/2013\n${inputLine}`,
      markdown: inputLine,
    });

    expect(result.text).toBe(`Certificate No.6157/2013\n${outputLine}`);
    expect(result.markdown).toBe(outputLine);
    expect(result.replacements).toEqual([
      { original: inputLine, updated: outputLine },
    ]);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  test('normalizes markdown heading lines and preserves the heading prefix', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content: JSON.stringify({
          output: 'FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA',
        }),
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma3n:e4b',
      minTokenLength: 8,
      chat,
    });

    const result = await normalizer.normalize({
      text: 'FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA',
      markdown: '# FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA',
    });

    expect(result.text).toBe('FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA');
    expect(result.markdown).toBe('# FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA');
    expect(result.replacements).toEqual([
      {
        original: 'FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA',
        updated: 'FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA',
      },
      {
        original: '# FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA',
        updated: '# FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA',
      },
    ]);
  });

  test('ignores model outputs that alter numeric content', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content: '{"output":"Certificate No. 6157/2018"}',
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma3n:e4b',
      minTokenLength: 8,
      chat,
    });

    const result = await normalizer.normalize({
      text: 'CertificateNo.6157/2013',
      markdown: '',
    });

    expect(result.text).toBe('CertificateNo.6157/2013');
    expect(result.replacements).toEqual([]);
  });
});

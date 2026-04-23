import { describe, expect, test, vi } from 'vitest';
import {
  __testing,
  createNoopGluedWordNormalizer,
  createOllamaGluedWordNormalizer,
  createRuntimeConfiguredGluedWordNormalizer,
} from './glued-word-normalizer.js';

const {
  applyReplacements,
  buildReplacements,
  collectLineCandidates,
  createSnippetUpdateMap,
  extractDigits,
  extractJsonObject,
  hasLongAllCapsRun,
  hasSuspiciousLowercaseGlue,
  hasSuspiciousWordBoundaryPattern,
  isSuspiciousLine,
  parseLooseOutputsArray,
  removeWhitespace,
  splitMarkdownLine,
  validateNormalization,
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

  test('detects suspicious lowercase glued words', () => {
    expect(hasSuspiciousLowercaseGlue('thehusband', 8)).toBe(true);
    expect(hasSuspiciousLowercaseGlue('permanentaddress', 8)).toBe(true);
    expect(hasSuspiciousLowercaseGlue('clean sentence only', 8)).toBe(false);
  });

  test('detects long all-caps OCR runs without flagging normal title case words', () => {
    expect(hasLongAllCapsRun('Issued by GOVERNMENTOFKERALA', 8)).toBe(true);
    expect(hasLongAllCapsRun('Certificate No.6157/2013', 8)).toBe(false);
  });

  test('ignores normal prose lines', () => {
    expect(isSuspiciousLine('This is a clean normal sentence.', 8)).toBe(false);
  });

  test('flags the missed real-world glued word examples as suspicious', () => {
    expect(isSuspiciousLine('ComputerEngineer', 8)).toBe(true);
    expect(isSuspiciousLine('PermanentAddress', 8)).toBe(true);
    expect(isSuspiciousLine('thehusband', 8)).toBe(true);
    expect(isSuspiciousLine('HOMEDEPARTMENT', 8)).toBe(true);
    expect(isSuspiciousLine('oMohammedaliKakkamoolakkal', 8)).toBe(true);
  });

  test('allows OCR corrections when content meaningfully changes', () => {
    expect(validateNormalization({
      original: 'Thisis tocertify underrule11(1)oftheRules',
      updated: 'This is to certify under rule 11(1) of the Rules',
    })).toBe('This is to certify under rule 11(1) of the Rules');
  });

  test('allows outputs that change numeric content during testing', () => {
    expect(validateNormalization({
      original: 'CertificateNo.6157/2013 dated06/02/2023',
      updated: 'Certificate No. 6157/2018 dated 06/02/2023',
    })).toBe('Certificate No. 6157/2018 dated 06/02/2023');
  });

  test('accepts outputs that only rearrange whitespace', () => {
    expect(validateNormalization({
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

  test('extracts JSON from thinking-model output with extra wrappers', () => {
    expect(extractJsonObject([
      '<think>I should preserve numbers.</think>',
      'Here is the final JSON:',
      '```json',
      '{"outputs":["GOVERNMENT OF KERALA"]}',
      '```',
    ].join('\n'))).toBe('{"outputs":["GOVERNMENT OF KERALA"]}');
  });

  test('recovers outputs from malformed JSON when the outputs array is still usable', () => {
    expect(parseLooseOutputsArray(
      '{"outputs":["FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA","DEPARTMENT OF PANCHAYAT",]}',
    )).toEqual([
      'FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA',
      'DEPARTMENT OF PANCHAYAT',
    ]);
  });

  test('maps shared snippet updates back onto each original line shape', () => {
    const snippetUpdates = createSnippetUpdateMap({
      candidates: [
        { snippet: 'GOVERNMENTOFKERALA' },
        { snippet: 'HOMEDEPARTMENT' },
      ],
      normalizedSnippets: ['GOVERNMENT OF KERALA', 'HOME DEPARTMENT'],
    });
    const replacements = buildReplacements({
      candidates: [
        {
          original: 'GOVERNMENTOFKERALA',
          snippet: 'GOVERNMENTOFKERALA',
          updated: next => next,
        },
        {
          original: '# GOVERNMENTOFKERALA',
          snippet: 'GOVERNMENTOFKERALA',
          updated: next => `# ${next}`,
        },
      ],
      snippetUpdates,
    });

    expect(replacements).toEqual([
      {
        original: 'GOVERNMENTOFKERALA',
        updated: 'GOVERNMENT OF KERALA',
      },
      {
        original: '# GOVERNMENTOFKERALA',
        updated: '# GOVERNMENT OF KERALA',
      },
    ]);
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
          outputs: [outputLine],
        }),
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
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
    expect(chat).toHaveBeenCalledTimes(1);
  });

  test('normalizes markdown heading lines and preserves the heading prefix', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content: JSON.stringify({
          outputs: ['FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA'],
        }),
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
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

  test('accepts model outputs that alter numeric content during testing', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content: '{"outputs":["Certificate No. 6157/2018"]}',
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
      minTokenLength: 8,
      chat,
    });

    const result = await normalizer.normalize({
      text: 'CertificateNo.6157/2013',
      markdown: '',
    });

    expect(result.text).toBe('Certificate No. 6157/2018');
    expect(result.replacements).toEqual([
      { original: 'CertificateNo.6157/2013', updated: 'Certificate No. 6157/2018' },
    ]);
  });

  test('batches multiple suspicious lines into a single Ollama call when they fit in one batch', async () => {
    const lineOne = 'GOVERNMENTOFKERALA';
    const lineTwo = 'DEPARTMENTOFPANCHAYAT';
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            outputs: [
              'GOVERNMENT OF KERALA',
              'DEPARTMENT OF PANCHAYAT',
            ],
          }),
        },
      });

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
      minTokenLength: 8,
      batchSize: 2,
      chat,
    });

    const result = await normalizer.normalize({
      text: [lineOne, lineTwo].join('\n'),
      markdown: '',
    });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.text).toBe([
      'GOVERNMENT OF KERALA',
      'DEPARTMENT OF PANCHAYAT',
    ].join('\n'));
    expect(result.replacements).toEqual([
      { original: lineOne, updated: 'GOVERNMENT OF KERALA' },
      { original: lineTwo, updated: 'DEPARTMENT OF PANCHAYAT' },
    ]);
  });

  test('parses thinking-model responses with <think> wrappers and code fences', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content: [
          '<think>I will preserve all digits and only fix spaces.</think>',
          '```json',
          '{"outputs":["GOVERNMENT OF KERALA HOME DEPARTMENT"]}',
          '```',
        ].join('\n'),
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
      minTokenLength: 8,
      chat,
    });

    const result = await normalizer.normalize({
      text: 'GOVFRNMENTOFKERALA HOMEDEPARTMENT',
      markdown: '',
    });

    expect(result.text).toBe('GOVERNMENT OF KERALA HOME DEPARTMENT');
    expect(result.replacements).toEqual([
      {
        original: 'GOVFRNMENTOFKERALA HOMEDEPARTMENT',
        updated: 'GOVERNMENT OF KERALA HOME DEPARTMENT',
      },
    ]);
  });

  test('recovers Gemma-style outputs arrays from malformed batch JSON', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content:
          '{"outputs":["FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA","DEPARTMENT OF PANCHAYAT",]}',
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
      minTokenLength: 8,
      batchSize: 2,
      chat,
    });

    const result = await normalizer.normalize({
      text: ['FORM No. IV [SeeRule11(1)] GOVERNMENTOFKERALA', 'DEPARTMENTOFPANCHAYAT'].join('\n'),
      markdown: '',
    });

    expect(result.text).toBe([
      'FORM No. IV [See Rule 11(1)] GOVERNMENT OF KERALA',
      'DEPARTMENT OF PANCHAYAT',
    ].join('\n'));
    expect(chat).toHaveBeenCalledTimes(1);
  });

  test('normalizes the newly-covered glued word patterns in one batch', async () => {
    const chat = vi.fn(async () => ({
      message: {
        content: JSON.stringify({
          outputs: [
            'Computer Engineer',
            'Permanent Address',
            'the husband',
            'HOME DEPARTMENT',
            'o Mohammedali Kakkamoolakkal',
          ],
        }),
      },
    }));

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'gemma4:e2b',
      minTokenLength: 8,
      batchSize: 5,
      chat,
    });

    const result = await normalizer.normalize({
      text: [
        'ComputerEngineer',
        'PermanentAddress',
        'thehusband',
        'HOMEDEPARTMENT',
        'oMohammedaliKakkamoolakkal',
      ].join('\n'),
      markdown: '',
    });

    expect(result.text).toBe([
      'Computer Engineer',
      'Permanent Address',
      'the husband',
      'HOME DEPARTMENT',
      'o Mohammedali Kakkamoolakkal',
    ].join('\n'));
    expect(chat).toHaveBeenCalledTimes(1);
  });

  test('falls back to the original snippets when the Ollama request fails', async () => {
    const chat = vi.fn(async () => {
      throw new Error('model not found');
    });

    const normalizer = createOllamaGluedWordNormalizer({
      model: 'missing-model',
      minTokenLength: 8,
      chat,
    });

    const result = await normalizer.normalize({
      text: 'GOVERNMENTOFKERALA',
      markdown: '',
    });

    expect(result.text).toBe('GOVERNMENTOFKERALA');
    expect(result.replacements).toEqual([]);
  });

  test('re-resolves runtime settings and can disable normalization without restarting', async () => {
    const settings = {
      enabled: true,
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      minTokenLength: 8,
      maxCandidates: 100,
      batchSize: 10,
      logRequests: false,
    };
    const resolveSettings = vi.fn(async () => settings);
    const normalizer = createRuntimeConfiguredGluedWordNormalizer({
      resolveSettings,
    });

    settings.enabled = false;

    const result = await normalizer.normalize({
      text: 'GOVERNMENTOFKERALA',
      markdown: '',
    });

    expect(resolveSettings).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('GOVERNMENTOFKERALA');
    expect(result.replacements).toEqual([]);
  });
});

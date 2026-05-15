import { describe, expect, test } from 'vitest';
import {
  detectDominantLanguageFromText,
  extractDoclingLanguageMetadata,
  resolveDocumentLanguage,
} from './language-detection.js';

describe('language detection', () => {
  test('detects dominant German text with a confidence score', () => {
    const language = detectDominantLanguageFromText(
      'Dies ist eine Rechnung für die Lieferung und die Zahlung ist innerhalb von vierzehn Tagen zu leisten.',
    );

    expect(language).toMatchObject({
      code: 'de',
      name: 'German',
      source: 'heuristic',
    });
    expect(language?.confidence).toBeGreaterThan(0.8);
  });

  test('returns null for tiny text samples', () => {
    expect(detectDominantLanguageFromText('Hallo Welt')).toBeNull();
  });

  test('prefers Docling language metadata when present', () => {
    expect(resolveDocumentLanguage({
      text: 'This English text should not be used when parser metadata is available.',
      rawStructuredOutput: {
        schema_name: 'DoclingDocument',
        metadata: {
          language: {
            code: 'de-DE',
            confidence: 0.97,
          },
        },
      },
    })).toEqual({
      code: 'de',
      name: 'German',
      confidence: 0.97,
      source: 'docling',
    });
  });

  test('uses the dominant language from split Docling parts', () => {
    expect(extractDoclingLanguageMetadata({
      schema_name: 'ArkivraDoclingSplitDocument',
      parts: [
        { metadata: { language: 'de' } },
        { metadata: { language: 'de' } },
        { metadata: { language: 'en' } },
      ],
    })).toEqual({
      code: 'de',
      name: 'German',
      confidence: null,
      source: 'docling',
    });
  });

  test('reads Docling tree metadata language when present on the document body', () => {
    expect(extractDoclingLanguageMetadata({
      schema_name: 'DoclingDocument',
      body: {
        self_ref: '#/body',
        meta: {
          docling__language: {
            code: 'fr',
            confidence: 0.91,
          },
        },
      },
    })).toEqual({
      code: 'fr',
      name: 'French',
      confidence: 0.91,
      source: 'docling',
    });
  });
});

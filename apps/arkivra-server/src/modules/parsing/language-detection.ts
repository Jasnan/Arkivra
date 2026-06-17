import type { DocumentLanguageMetadata } from './parsed-document.schema.js';
import { franc } from 'franc-min';

type SupportedLanguageCode = 'de' | 'en' | 'es' | 'fr';
type FrancLanguageCode = 'deu' | 'eng' | 'spa' | 'fra';

const LANGUAGE_NAMES: Record<SupportedLanguageCode, string> = {
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
};

const LANGUAGE_ALIASES: Record<string, SupportedLanguageCode> = {
  de: 'de',
  deu: 'de',
  ger: 'de',
  german: 'de',
  deutsch: 'de',
  en: 'en',
  eng: 'en',
  english: 'en',
  es: 'es',
  spa: 'es',
  spanish: 'es',
  espanol: 'es',
  español: 'es',
  fr: 'fr',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  francais: 'fr',
  français: 'fr',
};

const FRANC_LANGUAGE_CODES: FrancLanguageCode[] = ['deu', 'eng', 'spa', 'fra'];
const FRANC_TO_LANGUAGE_CODE: Record<FrancLanguageCode, SupportedLanguageCode> = {
  deu: 'de',
  eng: 'en',
  spa: 'es',
  fra: 'fr',
};

const MAX_DETECTION_CHARS = 12_000;
const MIN_DETECTION_CHARS = 40;

function normalizeLanguageCode(value: unknown): SupportedLanguageCode | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace('_', '-');
  const primary = normalized.split('-')[0] ?? normalized;

  return LANGUAGE_ALIASES[normalized] ?? LANGUAGE_ALIASES[primary] ?? null;
}

function confidenceFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : null;
}

function metadataFromCode(
  code: SupportedLanguageCode,
  source: DocumentLanguageMetadata['source'],
  confidence: number | null = null,
): DocumentLanguageMetadata {
  return {
    code,
    name: LANGUAGE_NAMES[code],
    confidence,
    source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNestedRecord(value: unknown, path: string[]) {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return current;
}

function languageFromMetadataValue(value: unknown): DocumentLanguageMetadata | null {
  const directCode = normalizeLanguageCode(value);
  if (directCode !== null) {
    return metadataFromCode(directCode, 'docling');
  }

  if (Array.isArray(value)) {
    const languages = value
      .map(item => languageFromMetadataValue(item))
      .filter((item): item is DocumentLanguageMetadata => item !== null);
    return pickDominantMetadataLanguage(languages);
  }

  if (!isRecord(value)) {
    return null;
  }

  const code = normalizeLanguageCode(value.code ?? value.lang ?? value.language ?? value.name);
  if (code === null) {
    return null;
  }

  return metadataFromCode(code, 'docling', confidenceFrom(value.confidence ?? value.score));
}

function pickDominantMetadataLanguage(languages: DocumentLanguageMetadata[]) {
  if (languages.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const language of languages) {
    counts.set(language.code, (counts.get(language.code) ?? 0) + 1);
  }

  const [code] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return languages.find(language => language.code === code) ?? null;
}

export function extractDoclingLanguageMetadata(rawStructuredOutput: unknown): DocumentLanguageMetadata | null {
  if (!isRecord(rawStructuredOutput)) {
    return null;
  }

  if (Array.isArray(rawStructuredOutput.parts)) {
    return pickDominantMetadataLanguage(
      rawStructuredOutput.parts
        .map(part => extractDoclingLanguageMetadata(part))
        .filter((item): item is DocumentLanguageMetadata => item !== null),
    );
  }

  const candidatePaths = [
    ['language'],
    ['languages'],
    ['lang'],
    ['metadata', 'language'],
    ['metadata', 'languages'],
    ['meta', 'language'],
    ['meta', 'languages'],
    ['meta', 'document_language'],
    ['meta', 'detected_language'],
    ['meta', 'docling__language'],
    ['body', 'meta', 'language'],
    ['body', 'meta', 'languages'],
    ['body', 'meta', 'document_language'],
    ['body', 'meta', 'detected_language'],
    ['body', 'meta', 'docling__language'],
    ['origin', 'language'],
    ['origin', 'languages'],
  ];

  for (const path of candidatePaths) {
    const language = languageFromMetadataValue(readNestedRecord(rawStructuredOutput, path));
    if (language !== null) {
      return language;
    }
  }

  return null;
}

export function detectDominantLanguageFromText(text: string): DocumentLanguageMetadata | null {
  const sample = text.slice(0, MAX_DETECTION_CHARS).trim();
  if (sample.length < MIN_DETECTION_CHARS) {
    return null;
  }

  const francCode = franc(sample, {
    minLength: MIN_DETECTION_CHARS,
    only: FRANC_LANGUAGE_CODES,
  });
  if (!isFrancLanguageCode(francCode)) {
    return null;
  }

  // Franc ranks candidates but does not return a calibrated probability.
  return metadataFromCode(FRANC_TO_LANGUAGE_CODE[francCode], 'heuristic');
}

function isFrancLanguageCode(value: string): value is FrancLanguageCode {
  return FRANC_LANGUAGE_CODES.includes(value as FrancLanguageCode);
}

export function resolveDocumentLanguage({
  text,
  rawStructuredOutput,
}: {
  text: string;
  rawStructuredOutput?: Record<string, unknown>;
}): DocumentLanguageMetadata | null {
  return extractDoclingLanguageMetadata(rawStructuredOutput) ?? detectDominantLanguageFromText(text);
}

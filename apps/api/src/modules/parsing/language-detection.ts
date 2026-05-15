import type { DocumentLanguageMetadata } from './parsed-document.schema.js';

type SupportedLanguageCode = 'de' | 'en' | 'es' | 'fr';

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

const STOPWORDS: Record<SupportedLanguageCode, Set<string>> = {
  de: new Set([
    'aber', 'als', 'auch', 'auf', 'aus', 'bei', 'das', 'dem', 'den', 'der', 'des', 'die',
    'dies', 'diese', 'dieser', 'ein', 'eine', 'einem', 'einen', 'einer', 'für', 'hat',
    'ich', 'im', 'ist', 'mit', 'nicht', 'oder', 'sich', 'und', 'von', 'werden', 'wie',
    'zu', 'zum', 'zur',
  ]),
  en: new Set([
    'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has',
    'have', 'in', 'is', 'it', 'not', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
    'was', 'were', 'will', 'with',
  ]),
  es: new Set([
    'al', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'esta', 'este', 'la', 'las',
    'los', 'no', 'o', 'para', 'por', 'que', 'se', 'su', 'un', 'una', 'y',
  ]),
  fr: new Set([
    'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'elle', 'en', 'est',
    'et', 'la', 'le', 'les', 'ne', 'ou', 'par', 'pas', 'pour', 'que', 'qui', 'sur',
    'un', 'une',
  ]),
};

const MIN_DETECTION_TOKENS = 12;
const MAX_DETECTION_CHARS = 12_000;

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

function tokenize(text: string) {
  return text
    .slice(0, MAX_DETECTION_CHARS)
    .toLocaleLowerCase()
    .normalize('NFC')
    .match(/\p{L}+/gu) ?? [];
}

function scoreLanguage(tokens: string[], language: SupportedLanguageCode) {
  let score = 0;
  const stopwords = STOPWORDS[language];

  for (const token of tokens) {
    if (stopwords.has(token)) {
      score += 1;
    }
  }

  const sample = tokens.join(' ');
  if (language === 'de' && /[äöüß]/.test(sample)) score += 3;
  if (language === 'es' && /[ñ¿¡]/.test(sample)) score += 3;
  if (language === 'fr' && /[àâçéèêëîïôùûüœ]/.test(sample)) score += 3;

  return score;
}

export function detectDominantLanguageFromText(text: string): DocumentLanguageMetadata | null {
  const tokens = tokenize(text);
  if (tokens.length < MIN_DETECTION_TOKENS) {
    return null;
  }

  const ranked = (Object.keys(STOPWORDS) as SupportedLanguageCode[])
    .map(code => ({ code, score: scoreLanguage(tokens, code) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1];

  if (best === undefined || best.score < 4) {
    return null;
  }

  if (runnerUp !== undefined && best.score - runnerUp.score < 2) {
    return null;
  }

  const confidence = Math.min(best.score / Math.max(best.score + (runnerUp?.score ?? 0), 1), 0.99);
  return metadataFromCode(best.code, 'heuristic', Number(confidence.toFixed(2)));
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

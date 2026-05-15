import type { DocumentLanguageMetadata } from '../parsing/parsed-document.schema.js';

export const EDITABLE_DOCUMENT_LANGUAGES = [
  { code: 'de', name: 'German' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
] as const;

type EditableDocumentLanguageCode = typeof EDITABLE_DOCUMENT_LANGUAGES[number]['code'];

const editableLanguageByCode = new Map<string, typeof EDITABLE_DOCUMENT_LANGUAGES[number]>(
  EDITABLE_DOCUMENT_LANGUAGES.map(language => [language.code, language]),
);

export function buildUserDocumentLanguageMetadata(
  code: string | null,
): DocumentLanguageMetadata | null {
  if (code === null) {
    return null;
  }

  const normalizedCode = code.trim().toLocaleLowerCase().split('-')[0] as EditableDocumentLanguageCode;
  const language = editableLanguageByCode.get(normalizedCode);

  if (language === undefined) {
    return null;
  }

  return {
    code: language.code,
    name: language.name,
    confidence: null,
    source: 'user',
  };
}

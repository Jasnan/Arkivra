import type { Locale } from '../i18n/i18n.constants.ts';
import type { TranslationsDictionary } from '../i18n/i18n.types.ts';
import { translations as en } from './en.ts';

export const translations: Record<Locale, TranslationsDictionary | Partial<TranslationsDictionary>> = {
  en,
};

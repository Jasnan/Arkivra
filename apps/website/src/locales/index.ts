import type { Locale } from '../i18n/i18n.constants';
import type { TranslationsDictionary } from '../i18n/i18n.types';
import { translations as en } from './en';

export const translations: Record<Locale, TranslationsDictionary | Partial<TranslationsDictionary>> = {
  en,
};

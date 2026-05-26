import type { TranslationsDictionary } from './i18n.types';
import { createBranchlet } from '@branchlet/core';
import { joinUrlPaths } from '@corentinth/chisels';
import { translations } from '../locales/index';
import { DEFAULT_LOCALE } from './i18n.constants';

export function getLocaleFromUrl(url: URL) {
  void url;
  return DEFAULT_LOCALE;
}

export function getTranslations({ locale }: { locale: string }): TranslationsDictionary {
  void locale;
  const defaultTranslations = translations[DEFAULT_LOCALE] as TranslationsDictionary;
  return defaultTranslations;
}

const { parse } = createBranchlet();

export function useI18n({ locale = DEFAULT_LOCALE }: { locale?: string } = {}) {
  return {
    locale,
    t: <K extends keyof TranslationsDictionary>(key: K, args?: Record<string, string | number>): TranslationsDictionary[K] => {
      const translations = getTranslations({ locale });
      const template = translations[key] ?? key;

      if (typeof template !== 'string') {
        return template;
      }

      return parse(template, args) as TranslationsDictionary[K];
    },
  };
}

export type Translator = ReturnType<typeof useI18n>['t'];

export function getPathWithoutLocale(url: URL | string) {
  const pathname = typeof url === 'string' ? url : url.pathname;

  // remove first / if exists
  const trimmedPathname = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const [firstSegment, ...rest] = trimmedPathname.split('/');

  if (firstSegment === DEFAULT_LOCALE) {
    return `/${rest.join('/')}`;
  }

  return pathname;
}

export function buildLocalizedPath({ locale = DEFAULT_LOCALE, path }: { locale?: string; path: string }) {
  void locale;
  return `/${joinUrlPaths(path)}`;
}

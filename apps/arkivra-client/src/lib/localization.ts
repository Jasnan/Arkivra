import type { PreferenceDateFormat, PreferenceLanguage } from '@/components/providers/accent-color-context';

type DateInput = string | Date | null | undefined;
interface LocalizationOptions {
  dateFormat?: PreferenceDateFormat | null;
  fallback?: string;
  language?: PreferenceLanguage;
}

const UI_PREFERENCES_CACHE_KEY = 'arkivra.uiPreferences';
const ISO_LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCALE_ALPHA_REGION_PATTERN = /^[a-z]{2}$/i;
const LOCALE_NUMERIC_REGION_PATTERN = /^\d{3}$/;
const languageLocales: Record<PreferenceLanguage, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
};
const dateFormatLocales: Record<PreferenceDateFormat, string> = {
  'DD.MM.YYYY': 'de-DE',
  'DD/MM/YYYY': 'en-GB',
  'DD-MM-YYYY': 'nl-NL',
  'MM/DD/YYYY': 'en-US',
  'YYYY-MM-DD': 'sv-SE',
  'YYYY/MM/DD': 'ja-JP',
};

function isPreferenceLanguage(value: unknown): value is PreferenceLanguage {
  return value === 'en' || value === 'de' || value === 'fr';
}

function isPreferenceDateFormat(value: unknown): value is PreferenceDateFormat {
  return value === 'DD.MM.YYYY'
    || value === 'DD/MM/YYYY'
    || value === 'DD-MM-YYYY'
    || value === 'MM/DD/YYYY'
    || value === 'YYYY-MM-DD'
    || value === 'YYYY/MM/DD';
}

function getCachedPreferences() {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(UI_PREFERENCES_CACHE_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getCachedLanguage() {
  const cached = getCachedPreferences();
  return isPreferenceLanguage(cached.language) ? cached.language : undefined;
}

function getCachedDateFormat() {
  const cached = getCachedPreferences();
  return isPreferenceDateFormat(cached.dateFormat) ? cached.dateFormat : null;
}

function getBrowserLocales() {
  if (typeof navigator === 'undefined') {
    return [];
  }

  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages.filter(locale => locale.trim().length > 0);
  }

  return navigator.language ? [navigator.language] : [];
}

function getLocaleLanguage(locale: string) {
  return locale.split('-')[0]?.toLowerCase();
}

function getLocaleRegion(locale: string) {
  return locale
    .replaceAll('_', '-')
    .split('-')
    .slice(1)
    .find(part => LOCALE_ALPHA_REGION_PATTERN.test(part) || LOCALE_NUMERIC_REGION_PATTERN.test(part))
    ?.toUpperCase();
}

function toSupportedLocale(locale: string | undefined, fallback: string) {
  if (!locale) {
    return fallback;
  }

  return Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0 ? locale : fallback;
}

function getLocaleForLanguage(language: PreferenceLanguage) {
  const browserLocales = getBrowserLocales();
  const matchingLanguageLocale = browserLocales.find(locale =>
    getLocaleLanguage(locale) === language && getLocaleRegion(locale) !== undefined,
  );
  const browserRegion = getLocaleRegion(matchingLanguageLocale ?? browserLocales[0] ?? '');
  const regionalLocale = browserRegion ? `${language}-${browserRegion}` : undefined;

  return toSupportedLocale(regionalLocale, languageLocales[language]);
}

export function getLocale(language: PreferenceLanguage | string | undefined = getCachedLanguage()) {
  if (isPreferenceLanguage(language)) {
    return getLocaleForLanguage(language);
  }

  if (typeof language === 'string' && language.trim().length > 0) {
    return toSupportedLocale(language, languageLocales.en);
  }

  const [browserLocale] = getBrowserLocales();

  if (browserLocale) {
    return browserLocale;
  }

  return languageLocales.en;
}

function parseDateInput(value: DateInput) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLocalDateInput(value: string | null | undefined) {
  const match = value?.match(ISO_LOCAL_DATE_PATTERN);

  if (match === undefined || match === null) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveDateFormat(dateFormat: PreferenceDateFormat | null | undefined) {
  return dateFormat === undefined ? getCachedDateFormat() : dateFormat;
}

function getDateLocale(dateFormat: PreferenceDateFormat | null | undefined) {
  const resolvedDateFormat = resolveDateFormat(dateFormat);
  return resolvedDateFormat === null ? null : dateFormatLocales[resolvedDateFormat];
}

function getDateFormatOptions(
  dateFormat: PreferenceDateFormat | null | undefined,
  automaticOptions: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (getDateLocale(dateFormat) !== null) {
    return {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
  }

  return automaticOptions;
}

function getDateTimeFormatOptions(
  dateFormat: PreferenceDateFormat | null | undefined,
  automaticDateOptions: Intl.DateTimeFormatOptions,
  timeStyle: Intl.DateTimeFormatOptions['timeStyle'],
): Intl.DateTimeFormatOptions {
  if (getDateLocale(dateFormat) !== null) {
    return {
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
  }

  return {
    ...automaticDateOptions,
    timeStyle,
  };
}

export function formatDate(value: DateInput, options?: LocalizationOptions) {
  const date = parseDateInput(value);

  if (date === null) {
    return options?.fallback ?? 'Not set';
  }

  return new Intl.DateTimeFormat(
    getDateLocale(options?.dateFormat) ?? getLocale(options?.language),
    getDateFormatOptions(options?.dateFormat, { dateStyle: 'long' }),
  ).format(date);
}

export function formatShortDate(value: DateInput, options?: LocalizationOptions) {
  const date = parseDateInput(value);

  if (date === null) {
    return options?.fallback ?? 'Not set';
  }

  return new Intl.DateTimeFormat(
    getDateLocale(options?.dateFormat) ?? getLocale(options?.language),
    getDateFormatOptions(options?.dateFormat, { dateStyle: 'medium' }),
  ).format(date);
}

export function formatLocalDateInput(value: string | null | undefined, options?: LocalizationOptions) {
  const date = parseLocalDateInput(value);

  if (date === null) {
    return options?.fallback ?? '';
  }

  return new Intl.DateTimeFormat(
    getDateLocale(options?.dateFormat) ?? getLocale(options?.language),
    getDateFormatOptions(options?.dateFormat, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  ).format(date);
}

export function getLocalDateInputPlaceholder(options?: LocalizationOptions) {
  const parts = new Intl.DateTimeFormat(
    getDateLocale(options?.dateFormat) ?? getLocale(options?.language),
    getDateFormatOptions(options?.dateFormat, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  ).formatToParts(new Date(2006, 10, 22));

  return parts
    .map((part) => {
      if (part.type === 'day') return 'dd';
      if (part.type === 'month') return part.value.length > 2 ? 'mmm' : 'mm';
      if (part.type === 'year') return part.value.length === 2 ? 'yy' : 'yyyy';
      return part.value;
    })
    .join('');
}

export function formatDateTime(value: DateInput, options?: LocalizationOptions) {
  const date = parseDateInput(value);

  if (date === null) {
    return options?.fallback ?? 'Not set';
  }

  return new Intl.DateTimeFormat(
    getDateLocale(options?.dateFormat) ?? getLocale(options?.language),
    getDateTimeFormatOptions(options?.dateFormat, { dateStyle: 'long' }, 'short'),
  ).format(date);
}

export function formatShortDateTime(value: DateInput, options?: LocalizationOptions) {
  const date = parseDateInput(value);

  if (date === null) {
    return options?.fallback ?? 'Not set';
  }

  return new Intl.DateTimeFormat(
    getDateLocale(options?.dateFormat) ?? getLocale(options?.language),
    getDateTimeFormatOptions(options?.dateFormat, { dateStyle: 'medium' }, 'short'),
  ).format(date);
}

export function formatTime(value: DateInput, options?: { fallback?: string; language?: PreferenceLanguage }) {
  const date = parseDateInput(value);

  if (date === null) {
    return options?.fallback ?? 'Not set';
  }

  return new Intl.DateTimeFormat(getLocale(options?.language), {
    timeStyle: 'short',
  }).format(date);
}

export function formatRelativeTime(value: DateInput, options?: { fallback?: string; language?: PreferenceLanguage; now?: Date }) {
  const date = parseDateInput(value);

  if (date === null) {
    return options?.fallback ?? 'Not set';
  }

  const now = options?.now ?? new Date();
  const diffMs = date.getTime() - now.getTime();
  const thresholds = [
    { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
    { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
    { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
    { unit: 'day', ms: 24 * 60 * 60 * 1000 },
    { unit: 'hour', ms: 60 * 60 * 1000 },
    { unit: 'minute', ms: 60 * 1000 },
  ] as const;
  const match = thresholds.find(({ ms }) => Math.abs(diffMs) >= ms);

  if (match === undefined) {
    return new Intl.RelativeTimeFormat(getLocale(options?.language), { numeric: 'auto' }).format(0, 'minute');
  }

  return new Intl.RelativeTimeFormat(getLocale(options?.language), { numeric: 'auto' }).format(
    Math.round(diffMs / match.ms),
    match.unit,
  );
}

export function formatDateRange(dateFrom?: string, dateTo?: string, options?: LocalizationOptions) {
  if (!dateFrom && !dateTo) {
    return 'Any time';
  }

  const fromLabel = dateFrom
    ? formatShortDate(`${dateFrom}T00:00:00`, { dateFormat: options?.dateFormat, language: options?.language })
    : 'Start';
  const toLabel = dateTo
    ? formatShortDate(`${dateTo}T00:00:00`, { dateFormat: options?.dateFormat, language: options?.language })
    : 'Now';

  return `${fromLabel} - ${toLabel}`;
}

export function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function getTimeZoneOffsetMinutes(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const utcTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((utcTime - date.getTime()) / 60_000);
}

export function formatUtcOffset(timeZone = getBrowserTimeZone(), date = new Date()) {
  try {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, date);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteMinutes = Math.abs(offsetMinutes);
    const hours = `${Math.floor(absoluteMinutes / 60)}`.padStart(2, '0');
    const minutes = `${absoluteMinutes % 60}`.padStart(2, '0');

    return `UTC${sign}${hours}:${minutes}`;
  } catch {
    return 'UTC+00:00';
  }
}

export function formatBrowserTimeZone() {
  const timeZone = getBrowserTimeZone();
  return `${timeZone} (${formatUtcOffset(timeZone)})`;
}

export function localDateToUtcBoundary(value: string | undefined, boundary: 'start' | 'end') {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const date = boundary === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999);

  return date.toISOString();
}

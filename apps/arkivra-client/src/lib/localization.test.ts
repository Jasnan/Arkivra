import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatLocalDateInput, getLocale } from './localization';

function mockLocalStorage() {
  const storage = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: vi.fn(() => storage.clear()),
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    },
  });
}

function mockNavigatorLocales(locales: string[]) {
  vi.stubGlobal('navigator', {
    ...navigator,
    language: locales[0],
    languages: locales,
  });
}

describe('localization', () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('keeps the browser region when resolving a stored language preference', () => {
    mockNavigatorLocales(['de-DE']);

    expect(getLocale('en')).toBe('en-DE');
    expect(formatLocalDateInput('2026-06-01', { language: 'en' })).toBe('01/06/2026');
  });

  it('uses explicit regional date format preferences when provided', () => {
    mockNavigatorLocales(['de-DE']);

    expect(formatLocalDateInput('2026-06-01', { dateFormat: 'DD.MM.YYYY', language: 'en' })).toBe('01.06.2026');
    expect(formatLocalDateInput('2026-06-01', { dateFormat: 'DD/MM/YYYY', language: 'en' })).toBe('01/06/2026');
    expect(formatLocalDateInput('2026-06-01', { dateFormat: 'DD-MM-YYYY', language: 'en' })).toBe('01-06-2026');
    expect(formatLocalDateInput('2026-06-01', { dateFormat: 'MM/DD/YYYY', language: 'en' })).toBe('06/01/2026');
    expect(formatLocalDateInput('2026-06-01', { dateFormat: 'YYYY-MM-DD', language: 'en' })).toBe('2026-06-01');
    expect(formatLocalDateInput('2026-06-01', { dateFormat: 'YYYY/MM/DD', language: 'en' })).toBe('2026/06/01');
  });

  it('uses cached date format preferences and treats missing values as automatic', () => {
    mockNavigatorLocales(['de-DE']);

    expect(formatLocalDateInput('2026-06-01')).toBe('01.06.2026');

    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({
      dateFormat: 'DD/MM/YYYY',
      language: 'en',
    }));

    expect(formatLocalDateInput('2026-06-01')).toBe('01/06/2026');
  });
});

import { createContext, use } from 'react';
import type { AppearanceFont } from './typography';

export type AccentColor =
  | 'gray'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'cyan'
  | 'purple'
  | 'pink';
export type { AppearanceFont };
export type AppearanceRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type AppearanceDensity = 'compact' | 'comfortable' | 'relaxed';
export type AppearanceFontSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type ThemeMode = 'system' | 'light' | 'dark';
export type PreferenceLanguage = 'en' | 'de' | 'fr';
export type PreferenceTimezone = 'auto' | 'utc' | 'europe-berlin' | 'america-new-york';
export type PreferenceDateFormat = 'medium' | 'numeric' | 'short';

export interface AccentColorContextValue {
  accentColor: AccentColor;
  dateFormat: PreferenceDateFormat;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  fontSize: AppearanceFontSize;
  language: PreferenceLanguage;
  radius: AppearanceRadius;
  themeMode: ThemeMode;
  timezone: PreferenceTimezone;
  setAccentColor: (accentColor: AccentColor) => void;
  setDateFormat: (dateFormat: PreferenceDateFormat) => void;
  setDensity: (density: AppearanceDensity) => void;
  setFontFamily: (fontFamily: AppearanceFont) => void;
  setFontSize: (fontSize: AppearanceFontSize) => void;
  setLanguage: (language: PreferenceLanguage) => void;
  setRadius: (radius: AppearanceRadius) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setTimezone: (timezone: PreferenceTimezone) => void;
}

export const AccentColorContext = createContext<AccentColorContextValue | null>(null);

export function useAccentColor() {
  const context = use(AccentColorContext);

  if (context === null) {
    throw new Error('useAccentColor must be used within AccentColorProvider.');
  }

  return context;
}

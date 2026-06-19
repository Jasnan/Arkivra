import { createContext, use } from 'react';
import type { AppearanceFont } from './typography';

export type AccentColor =
  | 'gray'
  | 'red'
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
export type ThemeMode = 'light' | 'dark';
export type PreferenceLanguage = 'en' | 'de' | 'fr';
export type PreferenceDateFormat =
  | 'DD.MM.YYYY'
  | 'DD/MM/YYYY'
  | 'DD-MM-YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD'
  | 'YYYY/MM/DD';
export type PreferenceFileBrowserView = 'list' | 'grid';
export type PreferenceChatAnswerMode = 'text' | 'multimodal';

export interface AccentColorContextValue {
  accentColor: AccentColor;
  defaultChatAnswerMode: PreferenceChatAnswerMode;
  defaultFileBrowserView: PreferenceFileBrowserView;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  fontSize: AppearanceFontSize;
  language: PreferenceLanguage;
  dateFormat: PreferenceDateFormat | null;
  radius: AppearanceRadius;
  showExtractedTextTab: boolean;
  themeMode: ThemeMode;
  setAccentColor: (accentColor: AccentColor) => void;
  setDefaultChatAnswerMode: (defaultChatAnswerMode: PreferenceChatAnswerMode) => void;
  setDefaultFileBrowserView: (defaultFileBrowserView: PreferenceFileBrowserView) => void;
  setDensity: (density: AppearanceDensity) => void;
  setFontFamily: (fontFamily: AppearanceFont) => void;
  setFontSize: (fontSize: AppearanceFontSize) => void;
  setLanguage: (language: PreferenceLanguage) => void;
  setDateFormat: (dateFormat: PreferenceDateFormat | null) => void;
  setRadius: (radius: AppearanceRadius) => void;
  setShowExtractedTextTab: (showExtractedTextTab: boolean) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
}

export const AccentColorContext = createContext<AccentColorContextValue | null>(null);

export function useAccentColor() {
  const context = use(AccentColorContext);

  if (context === null) {
    throw new Error('useAccentColor must be used within AccentColorProvider.');
  }

  return context;
}

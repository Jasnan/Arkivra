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

export interface AccentColorContextValue {
  accentColor: AccentColor;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  fontSize: AppearanceFontSize;
  radius: AppearanceRadius;
  themeMode: ThemeMode;
  setAccentColor: (accentColor: AccentColor) => void;
  setDensity: (density: AppearanceDensity) => void;
  setFontFamily: (fontFamily: AppearanceFont) => void;
  setFontSize: (fontSize: AppearanceFontSize) => void;
  setRadius: (radius: AppearanceRadius) => void;
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

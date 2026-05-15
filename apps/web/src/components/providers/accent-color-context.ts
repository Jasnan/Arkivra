import { createContext, use } from 'react';

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
export type AppearanceFont = 'outfit' | 'inter' | 'bricolage' | 'geist';
export type AppearanceRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type AppearanceDensity = 'compact' | 'comfortable' | 'relaxed';

export interface AccentColorContextValue {
  accentColor: AccentColor;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  radius: AppearanceRadius;
  setAccentColor: (accentColor: AccentColor) => void;
  setDensity: (density: AppearanceDensity) => void;
  setFontFamily: (fontFamily: AppearanceFont) => void;
  setRadius: (radius: AppearanceRadius) => void;
}

export const AccentColorContext = createContext<AccentColorContextValue | null>(null);

export function useAccentColor() {
  const context = use(AccentColorContext);

  if (context === null) {
    throw new Error('useAccentColor must be used within AccentColorProvider.');
  }

  return context;
}

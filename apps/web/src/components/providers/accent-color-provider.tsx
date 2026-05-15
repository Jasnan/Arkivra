import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { AccentColorContext } from './accent-color-context';
import type { AccentColor, AccentColorContextValue, AppearanceDensity, AppearanceFont, AppearanceRadius } from './accent-color-context';

const ACCENT_COLOR_STORAGE_KEY = 'arkivra.accentColor';
const DENSITY_STORAGE_KEY = 'arkivra.density';
const FONT_FAMILY_STORAGE_KEY = 'arkivra.fontFamily';
const RADIUS_STORAGE_KEY = 'arkivra.radius';

const accentPalettes: Record<AccentColor, {
  dark: AccentPalette;
  light: AccentPalette;
}> = {
  teal: {
    light: {
      focusRing: 'rgba(23, 138, 123, 0.35)',
      fg: '#11675d',
      hover: '#136f63',
      muted: '#9ee7d8',
      solid: '#178a7b',
      subtle: '#e4f7f3',
    },
    dark: {
      focusRing: 'rgba(20, 184, 166, 0.35)',
      fg: '#5eead4',
      hover: '#2dd4bf',
      muted: '#0c544d',
      solid: '#14b8a6',
      subtle: '#17352f',
    },
  },
  gray: {
    light: {
      focusRing: 'rgba(75, 85, 99, 0.35)',
      fg: '#374151',
      hover: '#1f2937',
      muted: '#d1d5db',
      solid: '#4b5563',
      subtle: '#f3f4f6',
    },
    dark: {
      focusRing: 'rgba(156, 163, 175, 0.35)',
      fg: '#d1d5db',
      hover: '#9ca3af',
      muted: '#374151',
      solid: '#9ca3af',
      subtle: '#1f2937',
    },
  },
  red: {
    light: {
      focusRing: 'rgba(220, 38, 38, 0.35)',
      fg: '#b91c1c',
      hover: '#991b1b',
      muted: '#fecaca',
      solid: '#dc2626',
      subtle: '#fef2f2',
    },
    dark: {
      focusRing: 'rgba(248, 113, 113, 0.35)',
      fg: '#fca5a5',
      hover: '#ef4444',
      muted: '#7f1d1d',
      solid: '#f87171',
      subtle: '#321616',
    },
  },
  orange: {
    light: {
      focusRing: 'rgba(234, 88, 12, 0.35)',
      fg: '#c2410c',
      hover: '#9a3412',
      muted: '#fed7aa',
      solid: '#ea580c',
      subtle: '#fff7ed',
    },
    dark: {
      focusRing: 'rgba(251, 146, 60, 0.35)',
      fg: '#fdba74',
      hover: '#f97316',
      muted: '#7c2d12',
      solid: '#fb923c',
      subtle: '#301a0a',
    },
  },
  yellow: {
    light: {
      focusRing: 'rgba(202, 138, 4, 0.35)',
      fg: '#a16207',
      hover: '#854d0e',
      muted: '#fde68a',
      solid: '#ca8a04',
      subtle: '#fefce8',
    },
    dark: {
      focusRing: 'rgba(250, 204, 21, 0.35)',
      fg: '#fde047',
      hover: '#eab308',
      muted: '#713f12',
      solid: '#facc15',
      subtle: '#2b2308',
    },
  },
  blue: {
    light: {
      focusRing: 'rgba(37, 99, 235, 0.35)',
      fg: '#1d4ed8',
      hover: '#1e40af',
      muted: '#bfdbfe',
      solid: '#2563eb',
      subtle: '#eff6ff',
    },
    dark: {
      focusRing: 'rgba(96, 165, 250, 0.35)',
      fg: '#93c5fd',
      hover: '#3b82f6',
      muted: '#1e3a8a',
      solid: '#60a5fa',
      subtle: '#172554',
    },
  },
  green: {
    light: {
      focusRing: 'rgba(22, 163, 74, 0.35)',
      fg: '#15803d',
      hover: '#166534',
      muted: '#bbf7d0',
      solid: '#16a34a',
      subtle: '#ecfdf5',
    },
    dark: {
      focusRing: 'rgba(34, 197, 94, 0.35)',
      fg: '#86efac',
      hover: '#4ade80',
      muted: '#14532d',
      solid: '#22c55e',
      subtle: '#132f1d',
    },
  },
  cyan: {
    light: {
      focusRing: 'rgba(8, 145, 178, 0.35)',
      fg: '#0e7490',
      hover: '#155e75',
      muted: '#a5f3fc',
      solid: '#0891b2',
      subtle: '#ecfeff',
    },
    dark: {
      focusRing: 'rgba(34, 211, 238, 0.35)',
      fg: '#67e8f9',
      hover: '#06b6d4',
      muted: '#164e63',
      solid: '#22d3ee',
      subtle: '#102a33',
    },
  },
  purple: {
    light: {
      focusRing: 'rgba(124, 58, 237, 0.35)',
      fg: '#6d28d9',
      hover: '#5b21b6',
      muted: '#ddd6fe',
      solid: '#7c3aed',
      subtle: '#f5f3ff',
    },
    dark: {
      focusRing: 'rgba(167, 139, 250, 0.35)',
      fg: '#c4b5fd',
      hover: '#8b5cf6',
      muted: '#4c1d95',
      solid: '#a78bfa',
      subtle: '#241538',
    },
  },
  pink: {
    light: {
      focusRing: 'rgba(219, 39, 119, 0.35)',
      fg: '#be185d',
      hover: '#9d174d',
      muted: '#fbcfe8',
      solid: '#db2777',
      subtle: '#fdf2f8',
    },
    dark: {
      focusRing: 'rgba(244, 114, 182, 0.35)',
      fg: '#f9a8d4',
      hover: '#ec4899',
      muted: '#831843',
      solid: '#f472b6',
      subtle: '#351526',
    },
  },
};

const fontFamilies: Record<AppearanceFont, string> = {
  outfit: "'Outfit', ui-sans-serif, system-ui, sans-serif",
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  bricolage: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  geist: "'Geist', ui-sans-serif, system-ui, sans-serif",
};

const radiusScales: Record<AppearanceRadius, Record<string, string>> = {
  none: {
    sm: '0',
    md: '0',
    lg: '0',
    xl: '0',
    '2xl': '0',
  },
  sm: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.625rem',
    '2xl': '0.75rem',
  },
  md: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.875rem',
    xl: '1rem',
    '2xl': '1.25rem',
  },
  lg: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  xl: {
    sm: '0.75rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    '2xl': '1.875rem',
  },
};

const densityScales: Record<AppearanceDensity, Record<string, string>> = {
  compact: {
    controlHeight: '2rem',
    controlPaddingX: '0.625rem',
    menuItemMinHeight: '2rem',
    menuItemPaddingY: '0.375rem',
    sectionPadding: '1rem',
    rowPaddingY: '0.625rem',
    listHeaderPaddingY: '0.5rem',
    listRowHeight: '3.5rem',
    listIconSize: '2rem',
    gridItemHeight: '12rem',
    gridItemPadding: '1rem',
    gridItemGap: '1.25rem',
  },
  comfortable: {
    controlHeight: '2.5rem',
    controlPaddingX: '0.75rem',
    menuItemMinHeight: '2.5rem',
    menuItemPaddingY: '0.5rem',
    sectionPadding: '1.25rem',
    rowPaddingY: '0.875rem',
    listHeaderPaddingY: '0.75rem',
    listRowHeight: '4.5rem',
    listIconSize: '2.5rem',
    gridItemHeight: '14rem',
    gridItemPadding: '1.25rem',
    gridItemGap: '2rem',
  },
  relaxed: {
    controlHeight: '2.75rem',
    controlPaddingX: '0.875rem',
    menuItemMinHeight: '2.75rem',
    menuItemPaddingY: '0.625rem',
    sectionPadding: '1.5rem',
    rowPaddingY: '1rem',
    listHeaderPaddingY: '0.875rem',
    listRowHeight: '5rem',
    listIconSize: '2.75rem',
    gridItemHeight: '15.5rem',
    gridItemPadding: '1.5rem',
    gridItemGap: '2.25rem',
  },
};

interface AccentPalette {
  focusRing: string;
  fg: string;
  hover: string;
  muted: string;
  solid: string;
  subtle: string;
}

function isAccentColor(value: string | null): value is AccentColor {
  return value === 'gray'
    || value === 'red'
    || value === 'orange'
    || value === 'yellow'
    || value === 'green'
    || value === 'teal'
    || value === 'blue'
    || value === 'cyan'
    || value === 'purple'
    || value === 'pink';
}

function isAppearanceFont(value: string | null): value is AppearanceFont {
  return value === 'outfit' || value === 'inter' || value === 'bricolage' || value === 'geist';
}

function isAppearanceRadius(value: string | null): value is AppearanceRadius {
  return value === 'none' || value === 'sm' || value === 'md' || value === 'lg' || value === 'xl';
}

function isAppearanceDensity(value: string | null): value is AppearanceDensity {
  return value === 'compact' || value === 'comfortable' || value === 'relaxed';
}

function getStoredValue(key: string) {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return null;
  }

  return window.localStorage.getItem(key);
}

function getStoredAccentColor(): AccentColor {
  const stored = getStoredValue(ACCENT_COLOR_STORAGE_KEY);
  return isAccentColor(stored) ? stored : 'teal';
}

function getStoredFontFamily(): AppearanceFont {
  const stored = getStoredValue(FONT_FAMILY_STORAGE_KEY);
  return isAppearanceFont(stored) ? stored : 'inter';
}

function getStoredDensity(): AppearanceDensity {
  const stored = getStoredValue(DENSITY_STORAGE_KEY);
  return isAppearanceDensity(stored) ? stored : 'comfortable';
}

function getStoredRadius(): AppearanceRadius {
  const stored = getStoredValue(RADIUS_STORAGE_KEY);
  return isAppearanceRadius(stored) ? stored : 'md';
}

function setStoredValue(key: string, value: string) {
  if (typeof window.localStorage?.setItem === 'function') {
    window.localStorage.setItem(key, value);
  }
}

function applyAccentColor(accentColor: AccentColor, resolvedTheme: string | undefined) {
  if (typeof document === 'undefined') {
    return;
  }

  const palette = accentPalettes[accentColor][resolvedTheme === 'light' ? 'light' : 'dark'];
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--chakra-colors-teal-solid', palette.solid);
  rootStyle.setProperty('--chakra-colors-teal-subtle', palette.subtle);
  rootStyle.setProperty('--chakra-colors-teal-fg', palette.fg);
  rootStyle.setProperty('--chakra-colors-teal-muted', palette.muted);
  rootStyle.setProperty('--chakra-colors-teal-hover', palette.hover);
  rootStyle.setProperty('--chakra-colors-teal-focus-ring', palette.focusRing);
}

function applyFontFamily(fontFamily: AppearanceFont) {
  if (typeof document === 'undefined') {
    return;
  }

  const family = fontFamilies[fontFamily];
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--chakra-fonts-body', family);
  rootStyle.setProperty('--chakra-fonts-heading', family);
}

function applyRadius(radius: AppearanceRadius) {
  if (typeof document === 'undefined') {
    return;
  }

  const rootStyle = document.documentElement.style;
  const scale = radiusScales[radius];

  for (const [token, value] of Object.entries(scale)) {
    rootStyle.setProperty(`--chakra-radii-${token}`, value);
  }
}

function applyDensity(density: AppearanceDensity) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const rootStyle = root.style;
  const scale = densityScales[density];

  root.dataset.density = density;

  for (const [token, value] of Object.entries(scale)) {
    rootStyle.setProperty(`--arkivra-${token}`, value);
  }
}

export function AccentColorProvider({ children }: PropsWithChildren) {
  const { resolvedTheme } = useTheme();
  const [accentColor, setAccentColor] = useState<AccentColor>(getStoredAccentColor);
  const [density, setDensity] = useState<AppearanceDensity>(getStoredDensity);
  const [fontFamily, setFontFamily] = useState<AppearanceFont>(getStoredFontFamily);
  const [radius, setRadius] = useState<AppearanceRadius>(getStoredRadius);

  useEffect(() => {
    setStoredValue(ACCENT_COLOR_STORAGE_KEY, accentColor);
    applyAccentColor(accentColor, resolvedTheme);
  }, [accentColor, resolvedTheme]);

  useEffect(() => {
    setStoredValue(DENSITY_STORAGE_KEY, density);
    applyDensity(density);
  }, [density]);

  useEffect(() => {
    setStoredValue(FONT_FAMILY_STORAGE_KEY, fontFamily);
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    setStoredValue(RADIUS_STORAGE_KEY, radius);
    applyRadius(radius);
  }, [radius]);

  const value = useMemo<AccentColorContextValue>(() => ({
    accentColor,
    density,
    fontFamily,
    radius,
    setAccentColor,
    setDensity,
    setFontFamily,
    setRadius,
  }), [accentColor, density, fontFamily, radius]);

  return (
    <AccentColorContext value={value}>
      {children}
    </AccentColorContext>
  );
}

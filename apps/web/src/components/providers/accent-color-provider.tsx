import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { authClient } from '@/lib/auth-client';
import { userPreferencesQueryKeys, useUpdateUserUiPreferencesMutation, useUserUiPreferencesQuery } from '@/features/user-preferences/user-preferences.queries';
import type { UserUiPreferences, UserUiPreferencesUpdate } from '@/features/user-preferences/user-preferences.types';
import { AccentColorContext } from './accent-color-context';
import type {
  AccentColor,
  AccentColorContextValue,
  AppearanceDensity,
  AppearanceFont,
  AppearanceFontSize,
  AppearanceRadius,
  PreferenceDateFormat,
  PreferenceLanguage,
  PreferenceTimezone,
  ThemeMode,
} from './accent-color-context';
import { LEGACY_FONT_FAMILY_STORAGE_KEY, defaultTypographyFont, isAppearanceFont } from './typography';

const UI_PREFERENCES_CACHE_KEY = 'arkivra.uiPreferences';
const LEGACY_ACCENT_COLOR_STORAGE_KEY = 'arkivra.accentColor';
const LEGACY_DENSITY_STORAGE_KEY = 'arkivra.density';
const LEGACY_FONT_SIZE_STORAGE_KEY = 'arkivra.fontSize';
const LEGACY_FONT_SIZE_SCALE_STORAGE_KEY = 'arkivra.fontSizeScale';
const LEGACY_RADIUS_STORAGE_KEY = 'arkivra.radius';
const defaultFontSize: AppearanceFontSize = 'md';
const defaultThemeMode: ThemeMode = 'system';
const PREFERENCES_SYNC_DEBOUNCE_MS = 450;

type UserUiPreferenceValues = Pick<
  UserUiPreferences,
  'accentColor' | 'dateFormat' | 'density' | 'fontFamily' | 'fontSize' | 'language' | 'radius' | 'themeMode' | 'timezone'
>;

const defaultUiPreferences: UserUiPreferenceValues = {
  themeMode: defaultThemeMode,
  accentColor: 'teal',
  density: 'comfortable',
  fontFamily: defaultTypographyFont,
  fontSize: defaultFontSize,
  radius: 'md',
  language: 'en',
  timezone: 'auto',
  dateFormat: 'medium',
};

const fontSizeScales: Record<AppearanceFontSize, string> = {
  sm: '0.95',
  md: '1',
  lg: '1.05',
  xl: '1.1',
  '2xl': '1.15',
};

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
      subtle: '#321414',
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

function isAppearanceRadius(value: string | null): value is AppearanceRadius {
  return value === 'none' || value === 'sm' || value === 'md' || value === 'lg' || value === 'xl';
}

function isAppearanceDensity(value: string | null): value is AppearanceDensity {
  return value === 'compact' || value === 'comfortable' || value === 'relaxed';
}

function isAppearanceFontSize(value: string | null): value is AppearanceFontSize {
  return value === 'sm' || value === 'md' || value === 'lg' || value === 'xl' || value === '2xl';
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isPreferenceLanguage(value: string | null): value is PreferenceLanguage {
  return value === 'en' || value === 'de' || value === 'fr';
}

function isPreferenceTimezone(value: string | null): value is PreferenceTimezone {
  return value === 'auto' || value === 'utc' || value === 'europe-berlin' || value === 'america-new-york';
}

function isPreferenceDateFormat(value: string | null): value is PreferenceDateFormat {
  return value === 'medium' || value === 'numeric' || value === 'short';
}

function getStoredValue(key: string) {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return null;
  }

  return window.localStorage.getItem(key);
}

function fontSizeFromLegacyScale(value: number): AppearanceFontSize {
  if (value <= 95) return 'sm';
  if (value <= 102) return 'md';
  if (value <= 107) return 'lg';
  if (value <= 112) return 'xl';
  return '2xl';
}

function getLegacyFontSize(): AppearanceFontSize {
  const stored = getStoredValue(LEGACY_FONT_SIZE_STORAGE_KEY);

  if (isAppearanceFontSize(stored)) {
    return stored;
  }

  const legacyScale = Number.parseInt(getStoredValue(LEGACY_FONT_SIZE_SCALE_STORAGE_KEY) ?? '', 10);

  if (Number.isFinite(legacyScale)) {
    return fontSizeFromLegacyScale(legacyScale);
  }

  return defaultFontSize;
}

function normalizeCachedPreferences(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const themeMode = typeof candidate.themeMode === 'string' && isThemeMode(candidate.themeMode)
    ? candidate.themeMode
    : defaultUiPreferences.themeMode;
  const accentColor = typeof candidate.accentColor === 'string' && isAccentColor(candidate.accentColor)
    ? candidate.accentColor
    : defaultUiPreferences.accentColor;
  const density = typeof candidate.density === 'string' && isAppearanceDensity(candidate.density)
    ? candidate.density
    : defaultUiPreferences.density;
  const fontFamily = typeof candidate.fontFamily === 'string' && isAppearanceFont(candidate.fontFamily)
    ? candidate.fontFamily
    : defaultUiPreferences.fontFamily;
  const fontSize = typeof candidate.fontSize === 'string' && isAppearanceFontSize(candidate.fontSize)
    ? candidate.fontSize
    : defaultUiPreferences.fontSize;
  const radius = typeof candidate.radius === 'string' && isAppearanceRadius(candidate.radius)
    ? candidate.radius
    : defaultUiPreferences.radius;
  const language = typeof candidate.language === 'string' && isPreferenceLanguage(candidate.language)
    ? candidate.language
    : defaultUiPreferences.language;
  const timezone = typeof candidate.timezone === 'string' && isPreferenceTimezone(candidate.timezone)
    ? candidate.timezone
    : defaultUiPreferences.timezone;
  const dateFormat = typeof candidate.dateFormat === 'string' && isPreferenceDateFormat(candidate.dateFormat)
    ? candidate.dateFormat
    : defaultUiPreferences.dateFormat;

  return { themeMode, accentColor, density, fontFamily, fontSize, radius, language, timezone, dateFormat };
}

function normalizePreferenceValues(value: unknown): UserUiPreferenceValues {
  return normalizeCachedPreferences(value) ?? defaultUiPreferences;
}

function getCachedPreferences() {
  const cached = getStoredValue(UI_PREFERENCES_CACHE_KEY);

  if (cached !== null) {
    try {
      const parsed = normalizeCachedPreferences(JSON.parse(cached));

      if (parsed !== null) {
        return parsed;
      }
    } catch {
    }
  }

  const legacyThemeMode = getStoredValue('arkivra.themeMode') ?? getStoredValue('theme');
  const legacyAccentColor = getStoredValue(LEGACY_ACCENT_COLOR_STORAGE_KEY);
  const legacyDensity = getStoredValue(LEGACY_DENSITY_STORAGE_KEY);
  const legacyFontFamily = getStoredValue(LEGACY_FONT_FAMILY_STORAGE_KEY);
  const legacyRadius = getStoredValue(LEGACY_RADIUS_STORAGE_KEY);

  return {
    themeMode: isThemeMode(legacyThemeMode) ? legacyThemeMode : defaultUiPreferences.themeMode,
    accentColor: isAccentColor(legacyAccentColor) ? legacyAccentColor : defaultUiPreferences.accentColor,
    density: isAppearanceDensity(legacyDensity) ? legacyDensity : defaultUiPreferences.density,
    fontFamily: isAppearanceFont(legacyFontFamily) ? legacyFontFamily : defaultUiPreferences.fontFamily,
    fontSize: getLegacyFontSize(),
    radius: isAppearanceRadius(legacyRadius) ? legacyRadius : defaultUiPreferences.radius,
    language: defaultUiPreferences.language,
    timezone: defaultUiPreferences.timezone,
    dateFormat: defaultUiPreferences.dateFormat,
  };
}

function setCachedPreferences(preferences: UserUiPreferenceValues) {
  if (typeof window.localStorage?.setItem === 'function') {
    window.localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify(preferences));
    window.localStorage.setItem('arkivra.themeMode', preferences.themeMode);
  }
}

function withoutServerTimestamps(preferences: UserUiPreferences): UserUiPreferenceValues {
  return normalizePreferenceValues(preferences);
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

  document.documentElement.dataset.arkivraFont = fontFamily;
}

function applyFontSize(fontSize: AppearanceFontSize) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.style.setProperty('--arkivra-user-font-scale', fontSizeScales[fontSize]);
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
  const { resolvedTheme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const cachedPreferences = useMemo(getCachedPreferences, []);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(cachedPreferences.themeMode);
  const [accentColor, setAccentColorState] = useState<AccentColor>(cachedPreferences.accentColor);
  const [density, setDensityState] = useState<AppearanceDensity>(cachedPreferences.density);
  const [fontFamily, setFontFamilyState] = useState<AppearanceFont>(cachedPreferences.fontFamily);
  const [fontSize, setFontSizeState] = useState<AppearanceFontSize>(cachedPreferences.fontSize);
  const [radius, setRadiusState] = useState<AppearanceRadius>(cachedPreferences.radius);
  const [language, setLanguageState] = useState<PreferenceLanguage>(cachedPreferences.language);
  const [timezone, setTimezoneState] = useState<PreferenceTimezone>(cachedPreferences.timezone);
  const [dateFormat, setDateFormatState] = useState<PreferenceDateFormat>(cachedPreferences.dateFormat);
  const [pendingServerPatch, setPendingServerPatch] = useState<UserUiPreferencesUpdate | null>(null);
  const currentPreferencesRef = useRef<UserUiPreferenceValues>(cachedPreferences);
  const pendingServerPatchRef = useRef<UserUiPreferencesUpdate | null>(null);
  const pendingRollbackRef = useRef<UserUiPreferenceValues | null>(null);
  const syncVersionRef = useRef(0);
  const isAuthenticated = Boolean(session.data?.user);
  const preferencesQuery = useUserUiPreferencesQuery({ enabled: isAuthenticated });
  const updatePreferencesMutation = useUpdateUserUiPreferencesMutation();

  const currentPreferences = useMemo(() => ({
    themeMode,
    accentColor,
    density,
    fontFamily,
    fontSize,
    radius,
    language,
    timezone,
    dateFormat,
  }), [accentColor, dateFormat, density, fontFamily, fontSize, language, radius, themeMode, timezone]);

  function applyPreferences(nextPreferences: UserUiPreferenceValues) {
    currentPreferencesRef.current = nextPreferences;
    setThemeModeState(nextPreferences.themeMode);
    setAccentColorState(nextPreferences.accentColor);
    setDensityState(nextPreferences.density);
    setFontFamilyState(nextPreferences.fontFamily);
    setFontSizeState(nextPreferences.fontSize);
    setRadiusState(nextPreferences.radius);
    setLanguageState(nextPreferences.language);
    setTimezoneState(nextPreferences.timezone);
    setDateFormatState(nextPreferences.dateFormat);
  }

  function updatePreferences(patch: UserUiPreferencesUpdate) {
    const previousPreferences = currentPreferencesRef.current;
    const nextPreferences = {
      ...previousPreferences,
      ...patch,
    };

    applyPreferences(nextPreferences);
    setCachedPreferences(nextPreferences);

    if (!isAuthenticated) {
      return;
    }

    if (pendingRollbackRef.current === null) {
      pendingRollbackRef.current = previousPreferences;
    }

    syncVersionRef.current += 1;
    const nextPendingPatch = {
      ...pendingServerPatchRef.current,
      ...patch,
    };
    pendingServerPatchRef.current = nextPendingPatch;
    setPendingServerPatch(nextPendingPatch);

    queryClient.cancelQueries({ queryKey: userPreferencesQueryKeys.ui() }).catch(() => undefined);

    queryClient.setQueryData<{ preferences: UserUiPreferences }>(
      userPreferencesQueryKeys.ui(),
      (current) => current
        ? {
            preferences: {
              ...current.preferences,
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          }
        : current,
    );
  }

  useEffect(() => {
    if (preferencesQuery.data?.preferences === undefined) {
      return;
    }

    if (pendingServerPatchRef.current !== null) {
      return;
    }

    const serverPreferences = withoutServerTimestamps(preferencesQuery.data.preferences);
    applyPreferences(serverPreferences);
    setCachedPreferences(serverPreferences);
  }, [pendingServerPatch, preferencesQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) {
      pendingRollbackRef.current = null;
      pendingServerPatchRef.current = null;
      setPendingServerPatch(null);
      return;
    }

    if (pendingServerPatch === null) {
      return;
    }

    const patch = pendingServerPatch;
    const syncVersion = syncVersionRef.current;
    const timeoutId = window.setTimeout(() => {
      updatePreferencesMutation.mutate(patch, {
        onSuccess: (data) => {
          if (syncVersionRef.current !== syncVersion) {
            return;
          }

          const serverPreferences = withoutServerTimestamps(data.preferences);
          applyPreferences(serverPreferences);
          setCachedPreferences(serverPreferences);
          queryClient.setQueryData(userPreferencesQueryKeys.ui(), data);
          pendingRollbackRef.current = null;
          pendingServerPatchRef.current = null;
          setPendingServerPatch(null);
        },
        onError: () => {
          if (syncVersionRef.current !== syncVersion) {
            return;
          }

          const rollbackPreferences = pendingRollbackRef.current ?? defaultUiPreferences;
          applyPreferences(rollbackPreferences);
          setCachedPreferences(rollbackPreferences);
          pendingRollbackRef.current = null;
          pendingServerPatchRef.current = null;
          setPendingServerPatch(null);
          queryClient.invalidateQueries({ queryKey: userPreferencesQueryKeys.ui() }).catch(() => undefined);
        },
      });
    }, PREFERENCES_SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isAuthenticated, pendingServerPatch, queryClient, updatePreferencesMutation]);

  useEffect(() => {
    applyAccentColor(accentColor, resolvedTheme);
  }, [accentColor, resolvedTheme]);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  useEffect(() => {
    applyRadius(radius);
  }, [radius]);

  useEffect(() => {
    setTheme(themeMode);
  }, [setTheme, themeMode]);

  useEffect(() => {
    setCachedPreferences(currentPreferences);
  }, [currentPreferences]);

  const value = useMemo<AccentColorContextValue>(() => ({
    accentColor,
    dateFormat,
    density,
    fontFamily,
    fontSize,
    language,
    radius,
    themeMode,
    timezone,
    setAccentColor: (nextAccentColor) => updatePreferences({ accentColor: nextAccentColor }),
    setDateFormat: (nextDateFormat) => updatePreferences({ dateFormat: nextDateFormat }),
    setDensity: (nextDensity) => updatePreferences({ density: nextDensity }),
    setFontFamily: (nextFontFamily) => updatePreferences({ fontFamily: nextFontFamily }),
    setFontSize: (nextFontSize) => updatePreferences({ fontSize: nextFontSize }),
    setLanguage: (nextLanguage) => updatePreferences({ language: nextLanguage }),
    setRadius: (nextRadius) => updatePreferences({ radius: nextRadius }),
    setThemeMode: (nextThemeMode) => updatePreferences({ themeMode: nextThemeMode }),
    setTimezone: (nextTimezone) => updatePreferences({ timezone: nextTimezone }),
  }), [accentColor, dateFormat, density, fontFamily, fontSize, language, radius, themeMode, timezone]);

  return (
    <AccentColorContext value={value}>
      {children}
    </AccentColorContext>
  );
}

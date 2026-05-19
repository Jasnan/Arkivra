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
  PreferenceFileBrowserView,
  PreferenceLanguage,
  PreferenceTimezone,
  ThemeMode,
} from './accent-color-context';
import { defaultTypographyFont, normalizeAppearanceFont } from './typography';

const UI_PREFERENCES_CACHE_KEY = 'arkivra.uiPreferences';
const THEME_MODE_STORAGE_KEY = 'arkivra.themeMode';
const LEGACY_UI_PREFERENCE_STORAGE_KEYS = [
  'arkivra.accentColor',
  'arkivra.density',
  'arkivra.fontFamily',
  'arkivra.fontSize',
  'arkivra.fontSizeScale',
  'arkivra.radius',
] as const;
const defaultFontSize: AppearanceFontSize = 'md';
const defaultThemeMode: ThemeMode = 'system';
const PREFERENCES_SYNC_DEBOUNCE_MS = 450;

type UserUiPreferenceValues = Pick<
  UserUiPreferences,
  | 'accentColor'
  | 'dateFormat'
  | 'defaultFileBrowserView'
  | 'density'
  | 'fontFamily'
  | 'fontSize'
  | 'language'
  | 'radius'
  | 'showExtractedTextTab'
  | 'themeMode'
  | 'timezone'
>;

type PreferenceSource = 'default' | 'local-storage' | 'server';

interface InitialPreferences {
  preferences: UserUiPreferenceValues;
  source: PreferenceSource;
}

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
  showExtractedTextTab: false,
  defaultFileBrowserView: 'list',
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
    gridItemHeight: '7rem',
    gridItemPadding: '0.625rem',
    gridItemGap: '0.55rem',
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
    gridItemHeight: '8rem',
    gridItemPadding: '0.75rem',
    gridItemGap: '0.8rem',
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
    gridItemHeight: '10rem',
    gridItemPadding: '1rem',
    gridItemGap: '1.05rem',
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

function isPreferenceFileBrowserView(value: string | null): value is PreferenceFileBrowserView {
  return value === 'list' || value === 'grid';
}

function getStoredValue(key: string) {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return null;
  }

  return window.localStorage.getItem(key);
}

function removeStoredValue(key: string) {
  if (typeof window === 'undefined' || typeof window.localStorage?.removeItem !== 'function') {
    return;
  }

  window.localStorage.removeItem(key);
}

function removeLegacyPreferenceStorage() {
  for (const key of LEGACY_UI_PREFERENCE_STORAGE_KEYS) {
    removeStoredValue(key);
  }
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
  const fontFamily = typeof candidate.fontFamily === 'string'
    ? normalizeAppearanceFont(candidate.fontFamily) ?? defaultUiPreferences.fontFamily
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
  const showExtractedTextTab = typeof candidate.showExtractedTextTab === 'boolean'
    ? candidate.showExtractedTextTab
    : defaultUiPreferences.showExtractedTextTab;
  const defaultFileBrowserView = typeof candidate.defaultFileBrowserView === 'string'
    && isPreferenceFileBrowserView(candidate.defaultFileBrowserView)
    ? candidate.defaultFileBrowserView
    : defaultUiPreferences.defaultFileBrowserView;

  return {
    themeMode,
    accentColor,
    density,
    fontFamily,
    fontSize,
    radius,
    language,
    timezone,
    dateFormat,
    showExtractedTextTab,
    defaultFileBrowserView,
  };
}

function normalizePreferenceValues(value: unknown): UserUiPreferenceValues {
  return normalizeCachedPreferences(value) ?? defaultUiPreferences;
}

function getInitialPreferences(): InitialPreferences {
  const cached = getStoredValue(UI_PREFERENCES_CACHE_KEY);

  if (cached !== null) {
    try {
      const parsed = normalizeCachedPreferences(JSON.parse(cached));

      if (parsed !== null) {
        removeLegacyPreferenceStorage();
        return { preferences: parsed, source: 'local-storage' };
      }
    } catch {
      removeStoredValue(UI_PREFERENCES_CACHE_KEY);
    }
  }

  removeLegacyPreferenceStorage();
  return { preferences: defaultUiPreferences, source: 'default' };
}

function setCachedPreferences(preferences: UserUiPreferenceValues) {
  if (typeof window.localStorage?.setItem === 'function') {
    window.localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify(preferences));
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, preferences.themeMode);
    removeLegacyPreferenceStorage();
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
  const initialPreferences = useMemo(getInitialPreferences, []);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(initialPreferences.preferences.themeMode);
  const [accentColor, setAccentColorState] = useState<AccentColor>(initialPreferences.preferences.accentColor);
  const [density, setDensityState] = useState<AppearanceDensity>(initialPreferences.preferences.density);
  const [fontFamily, setFontFamilyState] = useState<AppearanceFont>(initialPreferences.preferences.fontFamily);
  const [fontSize, setFontSizeState] = useState<AppearanceFontSize>(initialPreferences.preferences.fontSize);
  const [radius, setRadiusState] = useState<AppearanceRadius>(initialPreferences.preferences.radius);
  const [language, setLanguageState] = useState<PreferenceLanguage>(initialPreferences.preferences.language);
  const [timezone, setTimezoneState] = useState<PreferenceTimezone>(initialPreferences.preferences.timezone);
  const [dateFormat, setDateFormatState] = useState<PreferenceDateFormat>(initialPreferences.preferences.dateFormat);
  const [showExtractedTextTab, setShowExtractedTextTabState] = useState(initialPreferences.preferences.showExtractedTextTab);
  const [defaultFileBrowserView, setDefaultFileBrowserViewState] = useState<PreferenceFileBrowserView>(
    initialPreferences.preferences.defaultFileBrowserView,
  );
  const [preferenceSource, setPreferenceSource] = useState<PreferenceSource>(initialPreferences.source);
  const [pendingServerPatch, setPendingServerPatch] = useState<UserUiPreferencesUpdate | null>(null);
  const currentPreferencesRef = useRef<UserUiPreferenceValues>(initialPreferences.preferences);
  const pendingServerPatchRef = useRef<UserUiPreferencesUpdate | null>(null);
  const preferenceSourceRef = useRef<PreferenceSource>(initialPreferences.source);
  const syncVersionRef = useRef(0);
  const isAuthenticated = Boolean(session.data?.user);
  const preferencesQuery = useUserUiPreferencesQuery({
    enabled: isAuthenticated && preferenceSource === 'default',
  });
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
    defaultFileBrowserView,
    showExtractedTextTab,
  }), [
    accentColor,
    dateFormat,
    defaultFileBrowserView,
    density,
    fontFamily,
    fontSize,
    language,
    radius,
    showExtractedTextTab,
    themeMode,
    timezone,
  ]);

  function applyPreferences(nextPreferences: UserUiPreferenceValues, source: PreferenceSource) {
    currentPreferencesRef.current = nextPreferences;
    preferenceSourceRef.current = source;
    setPreferenceSource(source);
    setThemeModeState(nextPreferences.themeMode);
    setAccentColorState(nextPreferences.accentColor);
    setDensityState(nextPreferences.density);
    setFontFamilyState(nextPreferences.fontFamily);
    setFontSizeState(nextPreferences.fontSize);
    setRadiusState(nextPreferences.radius);
    setLanguageState(nextPreferences.language);
    setTimezoneState(nextPreferences.timezone);
    setDateFormatState(nextPreferences.dateFormat);
    setShowExtractedTextTabState(nextPreferences.showExtractedTextTab);
    setDefaultFileBrowserViewState(nextPreferences.defaultFileBrowserView);
  }

  function queueServerPatch(patch: UserUiPreferencesUpdate) {
    if (!isAuthenticated) {
      return;
    }

    syncVersionRef.current += 1;
    const nextPendingPatch = {
      ...pendingServerPatchRef.current,
      ...patch,
    };
    pendingServerPatchRef.current = nextPendingPatch;
    setPendingServerPatch(nextPendingPatch);
  }

  function updatePreferences(patch: UserUiPreferencesUpdate) {
    const nextPreferences = {
      ...currentPreferencesRef.current,
      ...patch,
    };

    applyPreferences(nextPreferences, 'local-storage');
    setCachedPreferences(nextPreferences);
    queueServerPatch(patch);

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

    if (preferenceSourceRef.current !== 'default' || pendingServerPatchRef.current !== null) {
      return;
    }

    const serverPreferences = withoutServerTimestamps(preferencesQuery.data.preferences);
    applyPreferences(serverPreferences, 'server');
    setCachedPreferences(serverPreferences);
  }, [preferencesQuery.data]);

  useEffect(() => {
    if (!isAuthenticated) {
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

          const syncedPreferences = currentPreferencesRef.current;
          queryClient.setQueryData(userPreferencesQueryKeys.ui(), {
            preferences: {
              ...data.preferences,
              ...syncedPreferences,
            },
          });
          pendingServerPatchRef.current = null;
          setPendingServerPatch(null);
        },
        onError: () => {
          if (syncVersionRef.current !== syncVersion) {
            return;
          }

          // Local preferences are the source of truth. A failed best-effort DB sync
          // must not visibly roll back the theme switcher.
          pendingServerPatchRef.current = null;
          setPendingServerPatch(null);
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
    if (preferenceSourceRef.current !== 'default') {
      setCachedPreferences(currentPreferences);
    }
  }, [currentPreferences]);

  const value = useMemo<AccentColorContextValue>(() => ({
    accentColor,
    dateFormat,
    defaultFileBrowserView,
    density,
    fontFamily,
    fontSize,
    language,
    radius,
    showExtractedTextTab,
    themeMode,
    timezone,
    setAccentColor: (nextAccentColor) => updatePreferences({ accentColor: nextAccentColor }),
    setDateFormat: (nextDateFormat) => updatePreferences({ dateFormat: nextDateFormat }),
    setDefaultFileBrowserView: (nextDefaultFileBrowserView) => updatePreferences({
      defaultFileBrowserView: nextDefaultFileBrowserView,
    }),
    setDensity: (nextDensity) => updatePreferences({ density: nextDensity }),
    setFontFamily: (nextFontFamily) => updatePreferences({ fontFamily: nextFontFamily }),
    setFontSize: (nextFontSize) => updatePreferences({ fontSize: nextFontSize }),
    setLanguage: (nextLanguage) => updatePreferences({ language: nextLanguage }),
    setRadius: (nextRadius) => updatePreferences({ radius: nextRadius }),
    setShowExtractedTextTab: (nextShowExtractedTextTab) => updatePreferences({
      showExtractedTextTab: nextShowExtractedTextTab,
    }),
    setThemeMode: (nextThemeMode) => updatePreferences({ themeMode: nextThemeMode }),
    setTimezone: (nextTimezone) => updatePreferences({ timezone: nextTimezone }),
  }), [
    accentColor,
    dateFormat,
    defaultFileBrowserView,
    density,
    fontFamily,
    fontSize,
    language,
    radius,
    showExtractedTextTab,
    themeMode,
    timezone,
  ]);

  return (
    <AccentColorContext value={value}>
      {children}
    </AccentColorContext>
  );
}

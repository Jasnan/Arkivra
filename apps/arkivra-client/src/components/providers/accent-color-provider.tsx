import type { PropsWithChildren } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  PreferenceChatAnswerMode,
  PreferenceDateFormat,
  PreferenceFileBrowserView,
  PreferenceLanguage,
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
const defaultThemeMode: ThemeMode = 'light';
const PREFERENCES_SYNC_DEBOUNCE_MS = 450;

type UserUiPreferenceValues = Pick<
  UserUiPreferences,
  | 'accentColor'
  | 'defaultChatAnswerMode'
  | 'defaultFileBrowserView'
  | 'density'
  | 'fontFamily'
  | 'fontSize'
  | 'language'
  | 'dateFormat'
  | 'radius'
  | 'showExtractedTextTab'
> & {
  themeMode: ThemeMode;
};

type LocalUiPreferencesUpdate = Partial<UserUiPreferenceValues>;

type PreferenceSource = 'default' | 'local-storage' | 'server';

interface InitialPreferences {
  preferences: UserUiPreferenceValues;
  source: PreferenceSource;
}

const defaultUiPreferences: UserUiPreferenceValues = {
  themeMode: defaultThemeMode,
  accentColor: 'blue',
  density: 'comfortable',
  fontFamily: defaultTypographyFont,
  fontSize: defaultFontSize,
  radius: 'md',
  language: 'en',
  dateFormat: null,
  showExtractedTextTab: false,
  defaultFileBrowserView: 'list',
  defaultChatAnswerMode: 'text',
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
      focusRing: 'rgba(23, 146, 153, 0.35)',
      fg: '#179299',
      hover: '#209fb5',
      muted: 'rgba(23, 146, 153, 0.32)',
      solid: '#179299',
      subtle: 'rgba(23, 146, 153, 0.12)',
    },
    dark: {
      focusRing: 'rgba(148, 226, 213, 0.38)',
      fg: '#94e2d5',
      hover: '#94e2d5',
      muted: 'rgba(148, 226, 213, 0.35)',
      solid: '#94e2d5',
      subtle: 'rgba(148, 226, 213, 0.15)',
    },
  },
  gray: {
    light: {
      focusRing: 'rgba(140, 143, 161, 0.35)',
      fg: '#4c4f69',
      hover: '#4c4f69',
      muted: '#acb0be',
      solid: '#8c8fa1',
      subtle: '#ccd0da',
    },
    dark: {
      focusRing: 'rgba(127, 132, 156, 0.38)',
      fg: '#cdd6f4',
      hover: '#cdd6f4',
      muted: '#585b70',
      solid: '#7f849c',
      subtle: '#313244',
    },
  },
  red: {
    light: {
      focusRing: 'rgba(210, 15, 57, 0.35)',
      fg: '#d20f39',
      hover: '#e64553',
      muted: 'rgba(210, 15, 57, 0.3)',
      solid: '#d20f39',
      subtle: 'rgba(210, 15, 57, 0.12)',
    },
    dark: {
      focusRing: 'rgba(243, 139, 168, 0.38)',
      fg: '#f38ba8',
      hover: '#f38ba8',
      muted: 'rgba(243, 139, 168, 0.35)',
      solid: '#f38ba8',
      subtle: 'rgba(243, 139, 168, 0.15)',
    },
  },
  orange: {
    light: {
      focusRing: 'rgba(254, 100, 11, 0.35)',
      fg: '#fe640b',
      hover: '#fe640b',
      muted: 'rgba(254, 100, 11, 0.32)',
      solid: '#fe640b',
      subtle: 'rgba(254, 100, 11, 0.12)',
    },
    dark: {
      focusRing: 'rgba(250, 179, 135, 0.38)',
      fg: '#fab387',
      hover: '#fab387',
      muted: 'rgba(250, 179, 135, 0.35)',
      solid: '#fab387',
      subtle: 'rgba(250, 179, 135, 0.15)',
    },
  },
  yellow: {
    light: {
      focusRing: 'rgba(223, 142, 29, 0.35)',
      fg: '#df8e1d',
      hover: '#df8e1d',
      muted: 'rgba(223, 142, 29, 0.32)',
      solid: '#df8e1d',
      subtle: 'rgba(223, 142, 29, 0.12)',
    },
    dark: {
      focusRing: 'rgba(249, 226, 175, 0.38)',
      fg: '#f9e2af',
      hover: '#f9e2af',
      muted: 'rgba(249, 226, 175, 0.35)',
      solid: '#f9e2af',
      subtle: 'rgba(249, 226, 175, 0.15)',
    },
  },
  blue: {
    light: {
      focusRing: 'rgba(30, 102, 245, 0.35)',
      fg: '#1e66f5',
      hover: '#209fb5',
      muted: 'rgba(30, 102, 245, 0.32)',
      solid: '#1e66f5',
      subtle: 'rgba(30, 102, 245, 0.12)',
    },
    dark: {
      focusRing: 'rgba(137, 180, 250, 0.38)',
      fg: '#89b4fa',
      hover: '#89b4fa',
      muted: 'rgba(137, 180, 250, 0.35)',
      solid: '#89b4fa',
      subtle: 'rgba(137, 180, 250, 0.15)',
    },
  },
  green: {
    light: {
      focusRing: 'rgba(64, 160, 43, 0.35)',
      fg: '#40a02b',
      hover: '#40a02b',
      muted: 'rgba(64, 160, 43, 0.32)',
      solid: '#40a02b',
      subtle: 'rgba(64, 160, 43, 0.12)',
    },
    dark: {
      focusRing: 'rgba(166, 227, 161, 0.38)',
      fg: '#a6e3a1',
      hover: '#a6e3a1',
      muted: 'rgba(166, 227, 161, 0.35)',
      solid: '#a6e3a1',
      subtle: 'rgba(166, 227, 161, 0.15)',
    },
  },
  cyan: {
    light: {
      focusRing: 'rgba(4, 165, 229, 0.35)',
      fg: '#209fb5',
      hover: '#04a5e5',
      muted: 'rgba(4, 165, 229, 0.32)',
      solid: '#04a5e5',
      subtle: 'rgba(4, 165, 229, 0.12)',
    },
    dark: {
      focusRing: 'rgba(137, 220, 235, 0.38)',
      fg: '#89dceb',
      hover: '#89dceb',
      muted: 'rgba(137, 220, 235, 0.35)',
      solid: '#89dceb',
      subtle: 'rgba(137, 220, 235, 0.15)',
    },
  },
  purple: {
    light: {
      focusRing: 'rgba(136, 57, 239, 0.35)',
      fg: '#8839ef',
      hover: '#8839ef',
      muted: 'rgba(136, 57, 239, 0.32)',
      solid: '#8839ef',
      subtle: 'rgba(136, 57, 239, 0.12)',
    },
    dark: {
      focusRing: 'rgba(203, 166, 247, 0.38)',
      fg: '#cba6f7',
      hover: '#cba6f7',
      muted: 'rgba(203, 166, 247, 0.35)',
      solid: '#cba6f7',
      subtle: 'rgba(203, 166, 247, 0.15)',
    },
  },
  pink: {
    light: {
      focusRing: 'rgba(234, 118, 203, 0.35)',
      fg: '#ea76cb',
      hover: '#ea76cb',
      muted: 'rgba(234, 118, 203, 0.32)',
      solid: '#ea76cb',
      subtle: 'rgba(234, 118, 203, 0.12)',
    },
    dark: {
      focusRing: 'rgba(245, 194, 231, 0.38)',
      fg: '#f5c2e7',
      hover: '#f5c2e7',
      muted: 'rgba(245, 194, 231, 0.35)',
      solid: '#f5c2e7',
      subtle: 'rgba(245, 194, 231, 0.15)',
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
    rowPaddingY: '0.5rem',
    listHeaderPaddingY: '0.375rem',
    listRowHeight: '3rem',
    listIconSize: '1.75rem',
    gridItemHeight: '6.25rem',
    gridItemPadding: '0.5rem',
    gridItemGap: '0.45rem',
  },
  comfortable: {
    controlHeight: '2.5rem',
    controlPaddingX: '0.75rem',
    menuItemMinHeight: '2.5rem',
    menuItemPaddingY: '0.5rem',
    sectionPadding: '1.25rem',
    rowPaddingY: '0.625rem',
    listHeaderPaddingY: '0.5rem',
    listRowHeight: '3.5rem',
    listIconSize: '2rem',
    gridItemHeight: '7rem',
    gridItemPadding: '0.625rem',
    gridItemGap: '0.55rem',
  },
  relaxed: {
    controlHeight: '2.75rem',
    controlPaddingX: '0.875rem',
    menuItemMinHeight: '2.75rem',
    menuItemPaddingY: '0.625rem',
    sectionPadding: '1.5rem',
    rowPaddingY: '0.875rem',
    listHeaderPaddingY: '0.75rem',
    listRowHeight: '4.5rem',
    listIconSize: '2.5rem',
    gridItemHeight: '8rem',
    gridItemPadding: '0.75rem',
    gridItemGap: '0.8rem',
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
  return value === 'light' || value === 'dark';
}

function isPreferenceLanguage(value: string | null): value is PreferenceLanguage {
  return value === 'en' || value === 'de' || value === 'fr';
}

function isPreferenceDateFormat(value: string | null): value is PreferenceDateFormat {
  return value === 'DD.MM.YYYY'
    || value === 'DD/MM/YYYY'
    || value === 'DD-MM-YYYY'
    || value === 'MM/DD/YYYY'
    || value === 'YYYY-MM-DD'
    || value === 'YYYY/MM/DD';
}

function isPreferenceFileBrowserView(value: string | null): value is PreferenceFileBrowserView {
  return value === 'list' || value === 'grid';
}

function isPreferenceChatAnswerMode(value: string | null): value is PreferenceChatAnswerMode {
  return value === 'text' || value === 'multimodal';
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

function applyThemeMode(themeMode: ThemeMode) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'system');
  root.classList.add(themeMode);
  root.style.colorScheme = themeMode;
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
  const dateFormat = candidate.dateFormat === null
    ? null
    : typeof candidate.dateFormat === 'string' && isPreferenceDateFormat(candidate.dateFormat)
      ? candidate.dateFormat
      : defaultUiPreferences.dateFormat;
  const showExtractedTextTab = typeof candidate.showExtractedTextTab === 'boolean'
    ? candidate.showExtractedTextTab
    : defaultUiPreferences.showExtractedTextTab;
  const defaultFileBrowserView = typeof candidate.defaultFileBrowserView === 'string'
    && isPreferenceFileBrowserView(candidate.defaultFileBrowserView)
    ? candidate.defaultFileBrowserView
    : defaultUiPreferences.defaultFileBrowserView;
  const defaultChatAnswerMode = typeof candidate.defaultChatAnswerMode === 'string'
    && isPreferenceChatAnswerMode(candidate.defaultChatAnswerMode)
    ? candidate.defaultChatAnswerMode
    : defaultUiPreferences.defaultChatAnswerMode;

  return {
    themeMode,
    accentColor,
    defaultChatAnswerMode,
    density,
    fontFamily,
    fontSize,
    radius,
    language,
    dateFormat,
    showExtractedTextTab,
    defaultFileBrowserView,
  };
}

function normalizePreferenceValues(value: unknown): UserUiPreferenceValues {
  return normalizeCachedPreferences(value) ?? getDefaultPreferences();
}

function getStoredThemeMode(fallback: ThemeMode = defaultThemeMode) {
  const storedThemeMode = getStoredValue(THEME_MODE_STORAGE_KEY);

  return isThemeMode(storedThemeMode) ? storedThemeMode : fallback;
}

function getDefaultPreferences(): UserUiPreferenceValues {
  return {
    ...defaultUiPreferences,
    themeMode: getStoredThemeMode(),
  };
}

function getInitialPreferences(): InitialPreferences {
  const cached = getStoredValue(UI_PREFERENCES_CACHE_KEY);

  if (cached !== null) {
    try {
      const parsed = normalizeCachedPreferences(JSON.parse(cached));

      if (parsed !== null) {
        const storedThemeMode = getStoredThemeMode(parsed.themeMode);
        removeLegacyPreferenceStorage();
        return {
          preferences: {
            ...parsed,
            themeMode: storedThemeMode,
          },
          source: 'local-storage',
        };
      }
    } catch {
      removeStoredValue(UI_PREFERENCES_CACHE_KEY);
    }
  }

  removeLegacyPreferenceStorage();
  return { preferences: getDefaultPreferences(), source: 'default' };
}

function setCachedPreferences(preferences: UserUiPreferenceValues) {
  if (typeof window.localStorage?.setItem === 'function') {
    const {
      themeMode,
      ...cachedPreferences
    } = preferences;

    window.localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify(cachedPreferences));
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
    removeLegacyPreferenceStorage();
  }
}

function withoutServerTimestamps(
  preferences: UserUiPreferences,
  currentThemeMode: ThemeMode,
): UserUiPreferenceValues {
  return {
    ...normalizePreferenceValues(preferences),
    themeMode: currentThemeMode,
  };
}

function toServerPreferencePatch(patch: LocalUiPreferencesUpdate): UserUiPreferencesUpdate {
  const {
    themeMode: _themeMode,
    ...serverPatch
  } = patch;

  return serverPatch;
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
  const [dateFormat, setDateFormatState] = useState<PreferenceDateFormat | null>(
    initialPreferences.preferences.dateFormat,
  );
  const [showExtractedTextTab, setShowExtractedTextTabState] = useState(initialPreferences.preferences.showExtractedTextTab);
  const [defaultFileBrowserView, setDefaultFileBrowserViewState] = useState<PreferenceFileBrowserView>(
    initialPreferences.preferences.defaultFileBrowserView,
  );
  const [defaultChatAnswerMode, setDefaultChatAnswerModeState] = useState<PreferenceChatAnswerMode>(
    initialPreferences.preferences.defaultChatAnswerMode,
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
    dateFormat,
    defaultChatAnswerMode,
    defaultFileBrowserView,
    showExtractedTextTab,
  }), [
    accentColor,
    defaultChatAnswerMode,
    defaultFileBrowserView,
    density,
    dateFormat,
    fontFamily,
    fontSize,
    language,
    radius,
    showExtractedTextTab,
    themeMode,
  ]);

  function applyPreferences(nextPreferences: UserUiPreferenceValues, source: PreferenceSource) {
    currentPreferencesRef.current = nextPreferences;
    applyThemeMode(nextPreferences.themeMode);
    applyAccentColor(nextPreferences.accentColor, nextPreferences.themeMode);
    preferenceSourceRef.current = source;
    setPreferenceSource(source);
    setThemeModeState(nextPreferences.themeMode);
    setAccentColorState(nextPreferences.accentColor);
    setDensityState(nextPreferences.density);
    setFontFamilyState(nextPreferences.fontFamily);
    setFontSizeState(nextPreferences.fontSize);
    setRadiusState(nextPreferences.radius);
    setLanguageState(nextPreferences.language);
    setDateFormatState(nextPreferences.dateFormat);
    setShowExtractedTextTabState(nextPreferences.showExtractedTextTab);
    setDefaultFileBrowserViewState(nextPreferences.defaultFileBrowserView);
    setDefaultChatAnswerModeState(nextPreferences.defaultChatAnswerMode);
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

  function updatePreferences(patch: LocalUiPreferencesUpdate) {
    const nextPreferences = {
      ...currentPreferencesRef.current,
      ...patch,
    };
    const serverPatch = toServerPreferencePatch(patch);

    applyPreferences(nextPreferences, 'local-storage');
    setCachedPreferences(nextPreferences);
    if (Object.keys(serverPatch).length > 0) {
      queueServerPatch(serverPatch);
    }

    queryClient.cancelQueries({ queryKey: userPreferencesQueryKeys.ui() }).catch(() => undefined);

    if (Object.keys(serverPatch).length === 0) {
      return;
    }

    queryClient.setQueryData<{ preferences: UserUiPreferences }>(
      userPreferencesQueryKeys.ui(),
      (current) => current
        ? {
            preferences: {
              ...current.preferences,
              ...serverPatch,
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

    const serverPreferences = withoutServerTimestamps(
      preferencesQuery.data.preferences,
      currentPreferencesRef.current.themeMode,
    );
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

          const syncedPreferences = toServerPreferencePatch(currentPreferencesRef.current);
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

  useLayoutEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode]);

  useLayoutEffect(() => {
    applyAccentColor(accentColor, themeMode);
  }, [accentColor, themeMode]);

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
    if (preferenceSourceRef.current !== 'default') {
      setCachedPreferences(currentPreferences);
    }
  }, [currentPreferences]);

  const value = useMemo<AccentColorContextValue>(() => ({
    accentColor,
    defaultChatAnswerMode,
    defaultFileBrowserView,
    density,
    fontFamily,
    fontSize,
    language,
    dateFormat,
    radius,
    showExtractedTextTab,
    themeMode,
    setAccentColor: (nextAccentColor) => updatePreferences({ accentColor: nextAccentColor }),
    setDefaultChatAnswerMode: (nextDefaultChatAnswerMode) => updatePreferences({
      defaultChatAnswerMode: nextDefaultChatAnswerMode,
    }),
    setDefaultFileBrowserView: (nextDefaultFileBrowserView) => updatePreferences({
      defaultFileBrowserView: nextDefaultFileBrowserView,
    }),
    setDensity: (nextDensity) => updatePreferences({ density: nextDensity }),
    setFontFamily: (nextFontFamily) => updatePreferences({ fontFamily: nextFontFamily }),
    setFontSize: (nextFontSize) => updatePreferences({ fontSize: nextFontSize }),
    setLanguage: (nextLanguage) => updatePreferences({ language: nextLanguage }),
    setDateFormat: (nextDateFormat) => updatePreferences({ dateFormat: nextDateFormat }),
    setRadius: (nextRadius) => updatePreferences({ radius: nextRadius }),
    setShowExtractedTextTab: (nextShowExtractedTextTab) => updatePreferences({
      showExtractedTextTab: nextShowExtractedTextTab,
    }),
    setThemeMode: (nextThemeMode) => updatePreferences({ themeMode: nextThemeMode }),
  }), [
    accentColor,
    defaultChatAnswerMode,
    defaultFileBrowserView,
    density,
    dateFormat,
    fontFamily,
    fontSize,
    language,
    radius,
    showExtractedTextTab,
    themeMode,
  ]);

  return (
    <AccentColorContext value={value}>
      {children}
    </AccentColorContext>
  );
}

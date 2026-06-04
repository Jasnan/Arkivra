import type {
  AccentColor,
  AppearanceDensity,
  AppearanceFont,
  AppearanceFontSize,
  AppearanceRadius,
  PreferenceFileBrowserView,
  PreferenceDateFormat,
  PreferenceLanguage,
  ThemeMode,
} from '@/components/providers/accent-color-context';

export interface UserUiPreferences {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  fontSize: AppearanceFontSize;
  radius: AppearanceRadius;
  language: PreferenceLanguage;
  dateFormat: PreferenceDateFormat | null;
  showExtractedTextTab: boolean;
  defaultFileBrowserView: PreferenceFileBrowserView;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<
    UserUiPreferences,
    'accentColor'
    | 'defaultFileBrowserView'
    | 'density'
    | 'fontFamily'
    | 'fontSize'
    | 'language'
    | 'dateFormat'
    | 'radius'
    | 'showExtractedTextTab'
    | 'themeMode'
  >
>;

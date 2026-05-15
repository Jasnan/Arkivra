import type {
  AccentColor,
  AppearanceDensity,
  AppearanceFont,
  AppearanceFontSize,
  AppearanceRadius,
  PreferenceDateFormat,
  PreferenceLanguage,
  PreferenceTimezone,
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
  timezone: PreferenceTimezone;
  dateFormat: PreferenceDateFormat;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<
    UserUiPreferences,
    'accentColor' | 'dateFormat' | 'density' | 'fontFamily' | 'fontSize' | 'language' | 'radius' | 'themeMode' | 'timezone'
  >
>;

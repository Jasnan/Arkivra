export type UiThemeMode = 'system' | 'light' | 'dark';
export type UiAccentColor = 'gray' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'cyan' | 'purple' | 'pink';
export type UiDensity = 'compact' | 'comfortable' | 'relaxed';
export type UiFontFamily = 'inter' | 'manrope' | 'space-grotesk';
export type UiFontSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type UiRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type UiLanguage = 'en' | 'de' | 'fr';
export type UiTimezone = 'auto' | 'utc' | 'europe-berlin' | 'america-new-york';
export type UiDateFormat = 'medium' | 'numeric' | 'short';

export interface UserUiPreferences {
  themeMode: UiThemeMode;
  accentColor: UiAccentColor;
  density: UiDensity;
  fontFamily: UiFontFamily;
  fontSize: UiFontSize;
  radius: UiRadius;
  language: UiLanguage;
  timezone: UiTimezone;
  dateFormat: UiDateFormat;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<
    UserUiPreferences,
    'accentColor' | 'dateFormat' | 'density' | 'fontFamily' | 'fontSize' | 'language' | 'radius' | 'themeMode' | 'timezone'
  >
>;

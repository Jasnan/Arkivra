export type UiThemeMode = 'system' | 'light' | 'dark';
export type UiAccentColor = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'cyan' | 'purple' | 'pink';
export type UiDensity = 'compact' | 'comfortable' | 'relaxed';
export type UiFontFamily = 'inter' | 'sora' | 'space-grotesk';
export type UiFontSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type UiRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type UiLanguage = 'en' | 'de' | 'fr';
export type UiTimezone = 'auto' | 'utc' | 'europe-berlin' | 'america-new-york';
export type UiDateFormat = 'medium' | 'numeric' | 'short';
export type UiFileBrowserView = 'list' | 'grid';

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
  showExtractedTextTab: boolean;
  defaultFileBrowserView: UiFileBrowserView;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<
    UserUiPreferences,
    'accentColor'
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
  >
>;

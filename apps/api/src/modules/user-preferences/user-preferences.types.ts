export type UiThemeMode = 'system' | 'light' | 'dark';
export type UiAccentColor = 'gray' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'cyan' | 'purple' | 'pink';
export type UiDensity = 'compact' | 'comfortable' | 'relaxed';
export type UiFontFamily = 'inter' | 'manrope' | 'space-grotesk';
export type UiFontSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type UiRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface UserUiPreferences {
  themeMode: UiThemeMode;
  accentColor: UiAccentColor;
  density: UiDensity;
  fontFamily: UiFontFamily;
  fontSize: UiFontSize;
  radius: UiRadius;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<UserUiPreferences, 'accentColor' | 'density' | 'fontFamily' | 'fontSize' | 'radius' | 'themeMode'>
>;

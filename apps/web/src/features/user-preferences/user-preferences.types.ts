import type {
  AccentColor,
  AppearanceDensity,
  AppearanceFont,
  AppearanceFontSize,
  AppearanceRadius,
  ThemeMode,
} from '@/components/providers/accent-color-context';

export interface UserUiPreferences {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  density: AppearanceDensity;
  fontFamily: AppearanceFont;
  fontSize: AppearanceFontSize;
  radius: AppearanceRadius;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<UserUiPreferences, 'accentColor' | 'density' | 'fontFamily' | 'fontSize' | 'radius' | 'themeMode'>
>;

export type UiThemeMode = 'dark' | 'light' | 'system';

export interface UserAppearancePreferences {
  themeMode: UiThemeMode;
  selectedTheme: string;
  selectedTweakcnTheme: string;
  selectedRadius: string;
  brandColors: Record<string, string>;
  sidebar: {
    variant: 'sidebar' | 'floating' | 'inset';
    collapsible: 'offcanvas' | 'icon' | 'none';
    side: 'left' | 'right';
  };
}

export interface UserRegionalPreferences {
  language: 'en';
  dateFormat:
    | 'DD.MM.YYYY'
    | 'DD/MM/YYYY'
    | 'DD-MM-YYYY'
    | 'MM/DD/YYYY'
    | 'YYYY-MM-DD'
    | 'YYYY/MM/DD'
    | null;
}

export interface UserUiPreferences {
  appearancePreferences: UserAppearancePreferences;
  regionalPreferences: UserRegionalPreferences;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Partial<
  Pick<UserUiPreferences, 'appearancePreferences' | 'regionalPreferences'>
>;

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

export interface UserUiPreferences {
  appearancePreferences: UserAppearancePreferences;
  createdAt: string;
  updatedAt: string;
}

export type UserUiPreferencesUpdate = Pick<UserUiPreferences, 'appearancePreferences'>;

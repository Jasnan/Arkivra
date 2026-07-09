import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createTimestampColumns } from './helpers.js';
import { usersTable } from './users.table.js';

export interface UserAppearancePreferencesJson {
  themeMode: 'dark' | 'light' | 'system';
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

export interface UserRegionalPreferencesJson {
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

export const defaultUserAppearancePreferencesJson = {
  themeMode: 'system',
  selectedTheme: 'default',
  selectedTweakcnTheme: '',
  selectedRadius: '0.5rem',
  brandColors: {},
  sidebar: {
    variant: 'inset',
    collapsible: 'offcanvas',
    side: 'left',
  },
} as const satisfies UserAppearancePreferencesJson;

export const defaultUserRegionalPreferencesJson = {
  language: 'en',
  dateFormat: null,
} as const satisfies UserRegionalPreferencesJson;

export const userUiPreferencesTable = pgTable('user_ui_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  ...createTimestampColumns(),

  appearancePreferences: jsonb('appearance_preferences')
    .$type<UserAppearancePreferencesJson>()
    .notNull()
    .default(defaultUserAppearancePreferencesJson),
  regionalPreferences: jsonb('regional_preferences')
    .$type<UserRegionalPreferencesJson>()
    .notNull()
    .default(defaultUserRegionalPreferencesJson),
});

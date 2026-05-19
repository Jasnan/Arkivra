import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { createTimestampColumns } from './helpers.js';
import { usersTable } from './users.table.js';

export const userUiPreferencesTable = pgTable('user_ui_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  ...createTimestampColumns(),

  themeMode: text('theme_mode', { enum: ['system', 'light', 'dark'] }).notNull().default('system'),
  accentColor: text('accent_color', {
    enum: ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'cyan', 'purple', 'pink'],
  }).notNull().default('teal'),
  density: text('density', { enum: ['compact', 'comfortable', 'relaxed'] }).notNull().default('comfortable'),
  fontFamily: text('font_family', { enum: ['inter', 'sora', 'space-grotesk'] }).notNull().default('inter'),
  fontSize: text('font_size', { enum: ['sm', 'md', 'lg', 'xl', '2xl'] }).notNull().default('md'),
  radius: text('radius', { enum: ['none', 'sm', 'md', 'lg', 'xl'] }).notNull().default('md'),
  language: text('language', { enum: ['en', 'de', 'fr'] }).notNull().default('en'),
  timezone: text('timezone', { enum: ['auto', 'utc', 'europe-berlin', 'america-new-york'] }).notNull().default('auto'),
  dateFormat: text('date_format', { enum: ['medium', 'numeric', 'short'] }).notNull().default('medium'),
  showExtractedTextTab: boolean('show_extracted_text_tab').notNull().default(false),
  defaultFileBrowserView: text('default_file_browser_view', { enum: ['list', 'grid'] }).notNull().default('list'),
});

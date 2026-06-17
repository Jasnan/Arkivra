import type { Database } from '../database/database.js';
import type { UiFontFamily, UserUiPreferences, UserUiPreferencesUpdate } from './user-preferences.types.js';
import { eq } from 'drizzle-orm';
import { userUiPreferencesTable } from '../database/schema/index.js';

const defaultPreferences: Required<UserUiPreferencesUpdate> = {
  themeMode: 'system',
  accentColor: 'teal',
  density: 'comfortable',
  fontFamily: 'inter',
  fontSize: 'md',
  radius: 'md',
  language: 'en',
  dateFormat: null,
  showExtractedTextTab: false,
  defaultFileBrowserView: 'list',
  defaultChatAnswerMode: 'text',
} satisfies Omit<UserUiPreferencesUpdate, never>;

type UserUiPreferencesRow = typeof userUiPreferencesTable.$inferSelect;

function normalizeFontFamily(fontFamily: string): UiFontFamily {
  if (fontFamily === 'manrope') return 'sora';
  if (fontFamily === 'inter' || fontFamily === 'sora' || fontFamily === 'space-grotesk') return fontFamily;
  return defaultPreferences.fontFamily;
}

function serializePreferences(row: UserUiPreferencesRow): UserUiPreferences {
  return {
    themeMode: row.themeMode,
    accentColor: row.accentColor,
    density: row.density,
    fontFamily: normalizeFontFamily(row.fontFamily),
    fontSize: row.fontSize,
    radius: row.radius,
    language: row.language,
    dateFormat: row.dateFormat,
    showExtractedTextTab: row.showExtractedTextTab,
    defaultFileBrowserView: row.defaultFileBrowserView,
    defaultChatAnswerMode: row.defaultChatAnswerMode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createUserPreferencesServices({ db }: { db: Database }) {
  async function getPreferences({ userId }: { userId: string }): Promise<UserUiPreferences> {
    const [stored] = await db
      .select()
      .from(userUiPreferencesTable)
      .where(eq(userUiPreferencesTable.userId, userId))
      .limit(1);

    if (stored !== undefined) {
      return serializePreferences(stored);
    }

    const [created] = await db
      .insert(userUiPreferencesTable)
      .values({
        userId,
        ...defaultPreferences,
      })
      .onConflictDoNothing()
      .returning();

    if (created !== undefined) {
      return serializePreferences(created);
    }

    const [existing] = await db
      .select()
      .from(userUiPreferencesTable)
      .where(eq(userUiPreferencesTable.userId, userId))
      .limit(1);

    if (existing === undefined) {
      throw new Error('Could not create user preferences.');
    }

    return serializePreferences(existing);
  }

  async function updatePreferences({
    userId,
    preferences,
  }: {
    userId: string;
    preferences: UserUiPreferencesUpdate;
  }): Promise<UserUiPreferences> {
    await getPreferences({ userId });

    const [updated] = await db
      .update(userUiPreferencesTable)
      .set({
        ...preferences,
        updatedAt: new Date(),
      })
      .where(eq(userUiPreferencesTable.userId, userId))
      .returning();

    if (updated === undefined) {
      throw new Error('Could not update user preferences.');
    }

    return serializePreferences(updated);
  }

  return {
    getPreferences,
    updatePreferences,
  };
}

export type UserPreferencesServices = ReturnType<typeof createUserPreferencesServices>;

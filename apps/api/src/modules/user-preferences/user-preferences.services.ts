import type { Database } from '../database/database.js';
import type { UserUiPreferences, UserUiPreferencesUpdate } from './user-preferences.types.js';
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
  timezone: 'auto',
  dateFormat: 'medium',
} satisfies Omit<UserUiPreferencesUpdate, never>;

type UserUiPreferencesRow = typeof userUiPreferencesTable.$inferSelect;

function serializePreferences(row: UserUiPreferencesRow): UserUiPreferences {
  return {
    themeMode: row.themeMode,
    accentColor: row.accentColor,
    density: row.density,
    fontFamily: row.fontFamily,
    fontSize: row.fontSize,
    radius: row.radius,
    language: row.language,
    timezone: row.timezone,
    dateFormat: row.dateFormat,
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

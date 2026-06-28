import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.js';
import { instanceSettingsTable } from '../../database/schema/index.js';

export const INSTANCE_OFFICE_CONVERSION_SETTINGS_ID = 'instance_office_document_conversion';

export type OfficeDocumentConversionSettings = {
  enabled: boolean;
  explicit: boolean;
};

export function createOfficeDocumentConversionSettingsServices({
  db,
  defaultEnabled,
}: {
  db: Database;
  defaultEnabled: boolean;
}) {
  async function getSettings(): Promise<OfficeDocumentConversionSettings> {
    const [row] = await db
      .select({
        enabled: instanceSettingsTable.officeDocumentConversionEnabled,
      })
      .from(instanceSettingsTable)
      .where(eq(instanceSettingsTable.id, INSTANCE_OFFICE_CONVERSION_SETTINGS_ID))
      .limit(1);

    if (row?.enabled === true || row?.enabled === false) {
      return { enabled: row.enabled, explicit: true };
    }

    return { enabled: defaultEnabled, explicit: false };
  }

  async function updateSettings({ enabled }: { enabled: boolean }) {
    await db
      .insert(instanceSettingsTable)
      .values({
        id: INSTANCE_OFFICE_CONVERSION_SETTINGS_ID,
        officeDocumentConversionEnabled: enabled,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: instanceSettingsTable.id,
        set: {
          officeDocumentConversionEnabled: enabled,
          updatedAt: sql`now()`,
        },
      });

    return { enabled, explicit: true };
  }

  return {
    getSettings,
    updateSettings,
  };
}

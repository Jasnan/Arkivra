import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.js';
import { instanceSettingsTable } from '../../database/schema/index.js';
import type { DocumentConverter, DocumentConverterHealth } from '../../document-conversion/index.js';

export const INSTANCE_OFFICE_CONVERSION_SETTINGS_ID = 'instance_office_document_conversion';

export type OfficeDocumentConversionSettings = {
  enabled: boolean;
  explicit: boolean;
};

export type OfficeDocumentConversionRuntimeState =
  | 'not_configured'
  | 'active'
  | 'paused'
  | 'unavailable';

export type OfficeDocumentConversionRuntimeStatus = {
  supported: true;
  enabled: boolean;
  settingSource: 'stored' | 'environment_default';
  configured: boolean;
  healthy: boolean;
  effectiveState: OfficeDocumentConversionRuntimeState;
  canScheduleConversion: boolean;
  provider: string | null;
  url: string | null;
  lastHealthCheck: string | null;
  error: string | null;
};

function runtimeStatusFromHealth({
  settings,
  health,
}: {
  settings: OfficeDocumentConversionSettings;
  health: DocumentConverterHealth;
}): OfficeDocumentConversionRuntimeStatus {
  const settingSource = settings.explicit ? 'stored' : 'environment_default';

  if (!health.configured) {
    return {
      supported: true,
      enabled: settings.enabled,
      settingSource,
      configured: false,
      healthy: false,
      effectiveState: 'not_configured',
      canScheduleConversion: false,
      provider: null,
      url: null,
      lastHealthCheck: null,
      error: null,
    };
  }

  if (!health.healthy) {
    return {
      supported: true,
      enabled: settings.enabled,
      settingSource,
      configured: true,
      healthy: false,
      effectiveState: 'unavailable',
      canScheduleConversion: false,
      provider: health.provider,
      url: health.url,
      lastHealthCheck: health.checkedAt,
      error: health.error,
    };
  }

  return {
    supported: true,
    enabled: settings.enabled,
    settingSource,
    configured: true,
    healthy: true,
    effectiveState: settings.enabled ? 'active' : 'paused',
    canScheduleConversion: settings.enabled,
    provider: health.provider,
    url: health.url,
    lastHealthCheck: health.checkedAt,
    error: null,
  };
}

export function createOfficeDocumentConversionSettingsServices({
  db,
  defaultEnabled,
  documentConverter,
}: {
  db: Database;
  defaultEnabled: boolean;
  documentConverter?: DocumentConverter;
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

  async function getRuntimeStatus(): Promise<OfficeDocumentConversionRuntimeStatus> {
    const settings = await getSettings();
    const health =
      documentConverter === undefined
        ? ({
            configured: false,
            healthy: false,
            provider: null,
            url: null,
            checkedAt: null,
            error: null,
          } satisfies DocumentConverterHealth)
        : await documentConverter.checkHealth();

    return runtimeStatusFromHealth({ settings, health });
  }

  return {
    getSettings,
    getRuntimeStatus,
    updateSettings,
  };
}

import { z } from 'zod';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireAdmin } from '../../authorization/authorization.middleware.js';
import type { ServerContext } from '../../server/server.types.js';
import type { Hono } from 'hono';
import type { DocumentConverter } from '../../document-conversion/index.js';
import type { Database } from '../../database/database.js';
import { createOfficeDocumentConversionSettingsServices } from './office-conversion-settings.js';

type MaintenanceQueue = {
  enqueueGenerateOfficePreviewPdfs: (data?: { limit?: number }) => Promise<void>;
};

const SUPPORTED_OFFICE_CONVERTER_FORMATS = [
  'DOC',
  'DOCX',
  'XLS',
  'XLSX',
  'PPT',
  'PPTX',
  'ODT',
  'ODS',
  'ODP',
];

const officePreviewPdfPayloadSchema = z
  .object({
    limit: z.number().int().min(1).max(10_000).optional(),
  })
  .optional();

const officeConversionSettingsSchema = z.object({
  enabled: z.boolean(),
});

export function registerAdminMaintenanceRoutes({
  app,
  db,
  documentConverter,
  maintenanceQueue,
}: {
  app: Hono<ServerContext>;
  db: Database;
  documentConverter?: DocumentConverter;
  maintenanceQueue?: MaintenanceQueue;
}) {
  app.use('/api/admin/maintenance', requireAuthentication(), requireAdmin());
  app.use('/api/admin/maintenance/*', requireAuthentication(), requireAdmin());
  const settingsServices = createOfficeDocumentConversionSettingsServices({
    db,
    defaultEnabled: documentConverter !== undefined,
  });

  app.get('/api/admin/maintenance/office-converter/status', async (context) => {
    const settings = await settingsServices.getSettings();

    if (documentConverter === undefined) {
      return context.json({
        officeConverter: {
          supported: true,
          enabled: settings.enabled,
          settingSource: settings.explicit ? 'stored' : 'environment_default',
          configured: false,
          healthy: false,
          provider: null,
          url: null,
          lastHealthCheck: null,
          error: null,
          supportedFormats: SUPPORTED_OFFICE_CONVERTER_FORMATS,
        },
      });
    }

    const health = await documentConverter.checkHealth();

    return context.json({
      officeConverter: {
        supported: true,
        enabled: settings.enabled,
        settingSource: settings.explicit ? 'stored' : 'environment_default',
        configured: health.configured,
        healthy: health.healthy,
        provider: health.provider,
        url: health.url,
        lastHealthCheck: health.checkedAt,
        error: health.error,
        supportedFormats: SUPPORTED_OFFICE_CONVERTER_FORMATS,
      },
    });
  });

  app.put('/api/admin/maintenance/office-converter/settings', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = officeConversionSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'admin.invalid_office_conversion_settings',
            message: 'Invalid Office document conversion settings payload.',
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const settings = await settingsServices.updateSettings(parsed.data);
    return context.json({
      settings: {
        enabled: settings.enabled,
        settingSource: 'stored',
      },
    });
  });

  app.post('/api/admin/maintenance/office-preview-pdfs', async (context) => {
    const settings = await settingsServices.getSettings();
    if (!settings.enabled) {
      return context.json(
        {
          error: {
            code: 'admin.office_conversion_disabled',
            message: 'Office document conversion is disabled.',
          },
        },
        409,
      );
    }

    if (maintenanceQueue === undefined) {
      return context.json(
        {
          error: {
            code: 'admin.maintenance_queue_unavailable',
            message: 'Maintenance queue is not available in this Arkivra process.',
          },
        },
        503,
      );
    }

    const payload = await context.req.json().catch(() => undefined);
    const parsed = officePreviewPdfPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'admin.invalid_maintenance_payload',
            message: 'Invalid maintenance job payload.',
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    await maintenanceQueue.enqueueGenerateOfficePreviewPdfs(parsed.data ?? {});

    return context.json(
      {
        job: {
          type: 'generate-office-preview-pdfs',
          status: 'queued',
        },
      },
      202,
    );
  });
}

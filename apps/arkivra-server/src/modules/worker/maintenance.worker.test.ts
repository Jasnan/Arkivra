import { describe, expect, test, vi } from 'vitest';
import { generateOfficePreviewPdfs, hardDeleteExpiredDocuments } from './maintenance.worker.js';

describe('maintenance worker cleanup', () => {
  test('hard deletes expired soft-deleted documents from storage and database', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: 'doc_1', original_name: 'report.pdf', original_storage_key: 'vlt_1/doc_1', vault_id: 'vlt_1' },
          { id: 'doc_2', original_name: 'notes.pdf', original_storage_key: 'vlt_1/doc_2', vault_id: 'vlt_1' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { storage_key: 'assets/doc_1/image-1.png' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'dvr_1', original_storage_key: 'vlt_1/dvr_1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const storage = {
      remove: vi.fn(async () => undefined),
      removePrefix: vi.fn(async () => undefined),
    };
    const auditServices = { emitAuditEvent: vi.fn(async () => ({ id: 'aud_1' })) };

    const result = await hardDeleteExpiredDocuments({
      db: { execute } as never,
      now: new Date('2026-04-03T00:00:00.000Z'),
      retentionDays: 30,
      storage: storage as never,
      auditServices: auditServices as never,
    });

    expect(result.deletedCount).toBe(2);
    expect(storage.remove).toHaveBeenCalledWith('assets/doc_1/image-1.png');
    expect(storage.remove).toHaveBeenCalledWith('vlt_1/doc_1');
    expect(storage.remove).toHaveBeenCalledWith('vlt_1/dvr_1');
    expect(storage.remove).toHaveBeenCalledWith('vlt_1/doc_2');
    expect(storage.removePrefix).toHaveBeenCalledWith('previews/doc_1');
    expect(storage.removePrefix).toHaveBeenCalledWith('previews/dvr_1');
    expect(storage.removePrefix).toHaveBeenCalledWith('previews/doc_2');
    expect(execute).toHaveBeenCalledTimes(7);
    expect(auditServices.emitAuditEvent).toHaveBeenCalledTimes(2);
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.deleted',
        eventCategory: 'document',
        outcome: 'success',
        actor: { type: 'system', displayName: 'System' },
        vaultId: 'vlt_1',
        documentId: 'doc_1',
        source: 'background',
        metadata: expect.objectContaining({
          document_name: 'report.pdf',
          file_name: 'report.pdf',
          deletion_type: 'retention',
        }),
      }),
    );
  });

  test('does nothing when no expired soft-deleted documents exist', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
    const storage = {
      remove: vi.fn(async () => undefined),
      removePrefix: vi.fn(async () => undefined),
    };

    const result = await hardDeleteExpiredDocuments({
      db: { execute } as never,
      retentionDays: 30,
      storage: storage as never,
    });

    expect(result.deletedCount).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.removePrefix).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('skips office preview generation when conversion is disabled', async () => {
    const documentConverter = {
      checkHealth: vi.fn(),
    };

    const result = await generateOfficePreviewPdfs({
      db: { execute: vi.fn() } as never,
      storage: {} as never,
      encryption: {} as never,
      parsePipeline: {} as never,
      documentConverter: documentConverter as never,
      resolveOfficeDocumentConversionRuntimeStatus: async () => ({
        supported: true,
        enabled: false,
        settingSource: 'stored',
        configured: true,
        healthy: true,
        effectiveState: 'paused',
        canScheduleConversion: false,
        provider: 'gotenberg',
        url: 'http://gotenberg:3000',
        lastHealthCheck: '2026-06-28T12:00:00.000Z',
        error: null,
      }),
    });

    expect(result).toEqual({
      convertedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      reason: 'paused',
      error: null,
    });
    expect(documentConverter.checkHealth).not.toHaveBeenCalled();
  });
});

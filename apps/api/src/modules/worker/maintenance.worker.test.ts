import { describe, expect, test, vi } from 'vitest';
import { hardDeleteExpiredDocuments } from './maintenance.worker.js';

describe('maintenance worker cleanup', () => {
  test('hard deletes expired soft-deleted documents from storage and database', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: 'doc_1', original_storage_key: 'vlt_1/doc_1' },
          { id: 'doc_2', original_storage_key: 'vlt_1/doc_2' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const storage = {
      remove: vi.fn(async () => undefined),
    };

    const result = await hardDeleteExpiredDocuments({
      db: { execute } as never,
      now: new Date('2026-04-03T00:00:00.000Z'),
      retentionDays: 30,
      storage: storage as never,
    });

    expect(result.deletedCount).toBe(2);
    expect(storage.remove).toHaveBeenCalledWith('vlt_1/doc_1');
    expect(storage.remove).toHaveBeenCalledWith('vlt_1/doc_2');
    expect(execute).toHaveBeenCalledTimes(3);
  });

  test('does nothing when no expired soft-deleted documents exist', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] });
    const storage = {
      remove: vi.fn(async () => undefined),
    };

    const result = await hardDeleteExpiredDocuments({
      db: { execute } as never,
      retentionDays: 30,
      storage: storage as never,
    });

    expect(result.deletedCount).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

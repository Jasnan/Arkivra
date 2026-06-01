import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminAuditEvents, getDocumentActivity, getVaultAuditEvents } from './audit.api';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('audit api helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads paginated document activity', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ activity: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await getDocumentActivity({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      cursor: '2026-01-01T00:00:00.000Z',
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/activity?cursor=2026-01-01T00%3A00%3A00.000Z&limit=10',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads vault audit events with filters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ events: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await getVaultAuditEvents({
      vaultId: 'vlt_1',
      filters: {
        eventType: 'document.deleted',
        outcome: 'success',
        actorId: 'usr_1',
        documentId: 'doc_1',
        dateFrom: '2026-01-01',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/audit-events?limit=50&eventType=document.deleted&outcome=success&actorId=usr_1&documentId=doc_1&dateFrom=2026-01-01',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('serializes multiple admin audit event type filters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ events: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await getAdminAuditEvents({
      filters: {
        eventType: ['document.viewed', 'ai.features_toggled'],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/audit-events?limit=50&eventType=document.viewed&eventType=ai.features_toggled',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

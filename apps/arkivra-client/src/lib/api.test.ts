import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/api';
import { fetchJson } from '@/lib/api';

describe('fetchJson', () => {
  it('returns undefined for 204 responses', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson<void>('/api/test', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      credentials: 'include',
      method: 'DELETE',
    }));
  });

  it('preserves structured error status, message, and code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'vault.forbidden',
        message: 'Forbidden',
      },
    }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Forbidden',
      code: 'vault.forbidden',
    } satisfies Partial<ApiError>);
  });
});

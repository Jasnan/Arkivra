import { describe, expect, it, vi } from 'vitest';
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
});

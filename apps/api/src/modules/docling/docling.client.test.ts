import { describe, expect, test, vi } from 'vitest';
import { createDoclingClient } from './docling.client.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('docling client', () => {
  test('submits async conversion, polls status, and fetches result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_1', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_1', task_status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_1', task_status: 'success' }))
      .mockResolvedValueOnce(jsonResponse({
        document: {
          md_content: '# Title',
          text_content: 'Title',
          json_content: {},
          html_content: '',
          doctags_content: '',
        },
        status: 'success',
        processing_time: 1.2,
        errors: [],
      }));

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    const result = await client.convertFile({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://docling.local/v1/convert/file/async',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://docling.local/v1/status/poll/task_1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://docling.local/v1/status/poll/task_1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://docling.local/v1/result/task_1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.document.text_content).toBe('Title');
  });

  test('throws when async status reaches failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_2', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({
        task_id: 'task_2',
        task_status: 'failure',
        errors: ['OCR failed'],
      }));

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(client.convertFile({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    })).rejects.toThrow(/Docling async conversion failed.*OCR failed/i);
  });

  test('throws when async conversion exceeds Arkivra wait limit', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_3', task_status: 'queued' }))
      .mockResolvedValue(jsonResponse({ task_id: 'task_3', task_status: 'processing' }));

    let now = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 10;
      return now;
    });

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 15,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(client.convertFile({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    })).rejects.toThrow(/exceeded Arkivra max wait/i);

    dateNowSpy.mockRestore();
  });
});

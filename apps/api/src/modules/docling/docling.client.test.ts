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
    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.get('ocr_engine')).toBe('tesseract');
    expect(submitBody.getAll('ocr_lang')).toEqual(['deu', 'eng']);
    expect(submitBody.get('ocr_custom_config')).toBeNull();
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

  test('allows overriding OCR language and full-page OCR config', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_cfg', task_status: 'success' }))
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
      convertOptions: {
        toFormats: 'md',
        doOcr: true,
        ocrEngine: 'tesseract',
        ocrLang: ['auto'],
        forceFullPageOcr: false,
        bitmapAreaThreshold: 0.1,
        tableMode: 'fast',
        abortOnError: false,
      },
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.convertFile({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.getAll('ocr_lang')).toEqual(['auto']);
    expect(submitBody.get('ocr_custom_config')).toBeNull();
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

  test('fails fast when Docling returns an unknown task_status', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_u', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_u', task_status: 'warp_drive' }));

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
    })).rejects.toThrow(/unknown task_status "warp_drive"/);
  });

  test('accepts null values in optional format fields (to_formats=text only)', async () => {
    // Regression: when we only request `to_formats=text`, Docling returns
    // null (not absent) for md_content/html_content/doctags_content. The
    // wire schema must tolerate nulls and normalize them to empty strings.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_n', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_n', task_status: 'success' }))
      .mockResolvedValueOnce(jsonResponse({
        document: {
          md_content: null,
          text_content: 'Hello world',
          json_content: null,
          html_content: null,
          doctags_content: null,
        },
        status: 'success',
        processing_time: 0.42,
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

    expect(result.document.text_content).toBe('Hello world');
    expect(result.document.md_content).toBe('');
    expect(result.document.html_content).toBe('');
    expect(result.document.doctags_content).toBe('');
  });

  test('rejects submit payloads that do not match the expected schema', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ unexpected: 'shape' }));

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
    })).rejects.toThrow(/unrecognized payload/);
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

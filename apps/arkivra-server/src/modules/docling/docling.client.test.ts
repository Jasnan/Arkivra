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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_1', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_1', task_status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_1', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
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
        }),
      );

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
    expect(submitBody.getAll('to_formats')).toEqual(['json', 'md']);
    expect(submitBody.get('ocr_preset')).toBe('auto');
    expect(submitBody.has('ocr_engine')).toBe(false);
    expect(submitBody.has('ocr_lang')).toBe(false);
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

  test('allows overriding OCR languages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_cfg', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
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
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      convertOptions: {
        ocrLang: ['en', 'de'],
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
    expect(submitBody.getAll('to_formats')).toEqual(['json', 'md']);
    expect(submitBody.get('ocr_preset')).toBe('auto');
    expect(submitBody.has('ocr_engine')).toBe(false);
    expect(submitBody.getAll('ocr_lang')).toEqual(['en', 'de']);
  });

  test('allows VLM pipeline options for conversion requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_vlm', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
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
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      convertOptions: {
        doOcr: false,
        pipeline: 'vlm',
        vlmPipelinePreset: 'granite_docling',
        vlmPipelineCustomConfig: '{"engine_options":{"engine_type":"api_ollama"}}',
      },
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.convertFile({
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.get('do_ocr')).toBe('false');
    expect(submitBody.get('pipeline')).toBe('vlm');
    expect(submitBody.get('vlm_pipeline_preset')).toBe('granite_docling');
    expect(submitBody.get('vlm_pipeline_custom_config')).toBe(
      '{"engine_options":{"engine_type":"api_ollama"}}',
    );
  });

  test('throws when async status reaches failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_2', task_status: 'queued' }))
      .mockResolvedValueOnce(
        jsonResponse({
          task_id: 'task_2',
          task_status: 'failure',
          errors: ['OCR failed'],
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(
      client.convertFile({
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow(/Docling async conversion failed.*OCR failed/i);
  });

  test('fails fast when Docling returns an unknown task_status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_u', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_u', task_status: 'warp_drive' }));

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(
      client.convertFile({
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow(/unknown task_status "warp_drive"/);
  });

  test('includes documented async task error_message when submit returns a failed task', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        task_id: 'task_failed',
        task_type: 'convert',
        task_status: 'failed',
        task_position: 0,
        task_meta: {
          num_docs: 1,
          num_processed: 1,
          num_succeeded: 0,
          num_failed: 1,
        },
        error_message: 'File format not allowed: test.txt',
      }),
    );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(
      client.convertFile({
        fileName: 'test.txt',
        mimeType: 'text/plain',
        fileData: Buffer.from('plain text'),
      }),
    ).rejects.toThrow(/File format not allowed: test\.txt/i);
  });

  test('includes task metadata when a failed async task has no error_message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        task_id: 'task_failed_meta',
        task_type: 'chunk',
        task_status: 'failed',
        task_position: 0,
        task_meta: {
          exception_type: 'RuntimeError',
          exception_message: 'RapidOCR preset is unavailable',
        },
      }),
    );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(
      client.convertFile({
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow(/RapidOCR preset is unavailable/i);
  });

  test('accepts null values in optional format fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_n', task_status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_n', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
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
        }),
      );

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

    await expect(
      client.convertFile({
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow(/unrecognized payload/);
  });

  test('throws when async conversion exceeds Arkivra wait limit', async () => {
    const fetchMock = vi
      .fn()
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

    await expect(
      client.convertFile({
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow(/exceeded Arkivra max wait/i);

    dateNowSpy.mockRestore();
  });

  test('allows chunk requests to override OCR per document', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_chunk', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      convertOptions: {
        doOcr: true,
      },
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.chunkFile({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
      convertOptions: {
        doOcr: false,
      },
    });

    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.get('include_converted_doc')).toBe('true');
    expect(submitBody.get('target_type')).toBe('inbody');
    expect(submitBody.get('convert_do_ocr')).toBe('false');
    expect(submitBody.get('convert_ocr_preset')).toBe('auto');
    expect(submitBody.has('convert_pipeline')).toBe(false);
    expect(submitBody.has('convert_ocr_engine')).toBe(false);
    expect(submitBody.has('convert_ocr_lang')).toBe(false);
    expect(submitBody.get('convert_include_images')).toBe('true');
    expect(submitBody.get('convert_image_export_mode')).toBe('embedded');
    expect(submitBody.get('chunking_include_raw_text')).toBe('true');
    expect(submitBody.get('chunking_max_tokens')).toBe('512');
    expect(submitBody.get('chunking_merge_peers')).toBe('true');
    expect(submitBody.has('do_ocr')).toBe(false);
    expect(submitBody.has('ocr_preset')).toBe(false);
    expect(submitBody.has('ocr_lang')).toBe(false);
    expect(submitBody.has('max_tokens')).toBe(false);
    expect(submitBody.has('merge_peers')).toBe(false);
  });

  test('allows per-request OCR preset override for chunk requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_chunk', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.chunkFile({
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
      convertOptions: {
        doOcr: true,
        ocrPreset: 'rapidocr',
        pipeline: 'standard',
      },
    });

    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.get('convert_do_ocr')).toBe('true');
    expect(submitBody.get('convert_ocr_preset')).toBe('rapidocr');
    expect(submitBody.get('convert_pipeline')).toBe('standard');
  });

  test('allows per-request VLM pipeline options for chunk requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_chunk_vlm', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.chunkFile({
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
      convertOptions: {
        doOcr: false,
        pipeline: 'vlm',
        vlmPipelinePreset: 'granite_docling',
        vlmPipelineCustomConfig: '{"engine_options":{"engine_type":"api_ollama"}}',
      },
    });

    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.get('convert_do_ocr')).toBe('false');
    expect(submitBody.get('convert_pipeline')).toBe('vlm');
    expect(submitBody.get('convert_vlm_pipeline_preset')).toBe('granite_docling');
    expect(submitBody.get('convert_vlm_pipeline_custom_config')).toBe(
      '{"engine_options":{"engine_type":"api_ollama"}}',
    );
  });

  test('submits hierarchical chunk requests to the documented endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_hierarchical', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.chunkFile({
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
      chunker: 'hierarchical',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://docling.local/v1/chunk/hierarchical/file/async',
      expect.objectContaining({ method: 'POST' }),
    );
    const submitRequest = fetchMock.mock.calls[0]?.[1];
    const submitBody = submitRequest?.body as FormData;
    expect(submitBody.get('include_converted_doc')).toBe('true');
    expect(submitBody.get('target_type')).toBe('inbody');
    expect(submitBody.get('convert_do_ocr')).toBe('true');
    expect(submitBody.get('chunking_include_raw_text')).toBe('true');
    expect(submitBody.has('chunking_max_tokens')).toBe(false);
    expect(submitBody.has('chunking_merge_peers')).toBe(false);
  });

  test('normalizes structured Docling chunk document errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_text', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [
            {
              filename: 'test.txt',
              chunk_index: 0,
              text: 'Plain text content',
              raw_text: 'Plain text content',
              num_tokens: 3,
              headings: null,
              captions: null,
              doc_items: [],
              page_numbers: null,
              metadata: null,
            },
          ],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: 'Plain text content',
                text_content: 'Plain text content',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [{ message: 'Unsupported image block skipped' }],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    const result = await client.chunkFile({
      fileName: 'test.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from('Plain text content'),
    });

    expect(result.documents[0]?.errors).toEqual(['Unsupported image block skipped']);
    expect(result.chunks).toHaveLength(1);
  });

  test('retries transient chunk submit fetch failures before succeeding', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_retry', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );
    const sleepMock = vi.fn(async () => undefined);

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      requestRetryAttempts: 2,
      requestRetryDelayMs: 5,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: sleepMock,
    });

    await client.chunkFile({
      fileName: 'retry.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleepMock).toHaveBeenCalledWith(5);
  });

  test('fails after exhausting chunk submit retries', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      requestRetryAttempts: 1,
      requestRetryDelayMs: 5,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await expect(
      client.chunkFile({
        fileName: 'retry.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow(/Docling chunk async submit failed .*fetch failed/i);
  });

  test('resubmits chunking when a polled task disappears after Docling restarts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_lost', task_status: 'queued' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Task not found.' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task_recovered', task_status: 'success' }))
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      chunkTaskRecoveryAttempts: 1,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.chunkFile({
      fileName: 'retry.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://docling.local/v1/chunk/hybrid/file/async',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('keeps polling the same chunk task after transient poll fetch failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ task_id: 'task_poll_fetch_failed', task_status: 'queued' }),
      )
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(
        jsonResponse({ task_id: 'task_poll_fetch_failed', task_status: 'success' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          chunks: [],
          documents: [
            {
              kind: 'ExportResult',
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
          processing_time: 0.1,
        }),
      );

    const client = createDoclingClient({
      baseUrl: 'http://docling.local',
      pollIntervalMs: 1,
      maxWaitMs: 10_000,
      requestRetryAttempts: 2,
      requestRetryDelayMs: 5,
      chunkTaskRecoveryAttempts: 1,
      fetchImpl: fetchMock as typeof fetch,
      sleepImpl: async () => undefined,
    });

    await client.chunkFile({
      fileName: 'retry.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://docling.local/v1/status/poll/task_poll_fetch_failed',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

import { describe, expect, test, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createUnstructuredClient } from './unstructured.client.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function makePdf(pageCount: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([200, 200]);
  }
  return Buffer.from(await pdf.save());
}

describe('unstructured client', () => {
  test('posts a file to the partition endpoint with notebook-equivalent options', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([
      {
        type: 'Title',
        element_id: 'el_1',
        text: 'Attention Is All You Need',
        metadata: { page_number: 1, filetype: 'application/pdf' },
      },
    ]));

    const client = createUnstructuredClient({
      baseUrl: 'http://unstructured.local',
      apiKey: 'secret',
      partitionOptions: { splitPdfPage: false },
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await client.partitionFile({
      fileName: 'paper.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('pdf-bytes'),
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://unstructured.local/general/v0/general',
      expect.objectContaining({ method: 'POST' }),
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as FormData;
    const headers = request?.headers as Headers;

    expect(body.get('strategy')).toBe('hi_res');
    expect(body.get('pdf_infer_table_structure')).toBe('true');
    expect(body.getAll('extract_image_block_types')).toEqual(['Image']);
    expect(body.getAll('languages')).toEqual(['deu', 'eng']);
    expect(headers.get('unstructured-api-key')).toBe('secret');
    expect(result[0]?.text).toBe('Attention Is All You Need');
  });

  test('allows overriding strategy, languages, and image block extraction', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));

    const client = createUnstructuredClient({
      baseUrl: 'http://unstructured.local',
      partitionOptions: {
        strategy: 'auto',
        languages: ['eng'],
        inferTableStructure: false,
        extractImageBlockTypes: ['Image', 'Table'],
        splitPdfPage: false,
      },
      fetchImpl: fetchMock as typeof fetch,
    });

    await client.partitionFile({
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as FormData;
    const headers = request?.headers as Headers;

    expect(body.get('strategy')).toBe('auto');
    expect(body.get('pdf_infer_table_structure')).toBe('false');
    expect(body.getAll('languages')).toEqual(['eng']);
    expect(body.getAll('extract_image_block_types')).toEqual(['Image', 'Table']);
    expect(headers.get('unstructured-api-key')).toBeNull();
  });

  test('throws on non-2xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('bad request', {
      status: 422,
      statusText: 'Unprocessable Entity',
    }));

    const client = createUnstructuredClient({
      baseUrl: 'http://unstructured.local',
      partitionOptions: { splitPdfPage: false },
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.partitionFile({
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    })).rejects.toThrow(/Unstructured partition error: 422/);
  });

  test('includes the low-level fetch failure cause when transport fails', async () => {
    const cause = new Error('other side closed');
    const fetchError = new Error('fetch failed', { cause });
    const fetchMock = vi.fn(async () => {
      throw fetchError;
    });

    const client = createUnstructuredClient({
      baseUrl: 'http://unstructured.local',
      partitionOptions: { splitPdfPage: false },
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.partitionFile({
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    })).rejects.toThrow(/fetch failed: other side closed/);
  });

  test('rejects payloads that are not element arrays', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ unexpected: 'shape' }));

    const client = createUnstructuredClient({
      baseUrl: 'http://unstructured.local',
      partitionOptions: { splitPdfPage: false },
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(client.partitionFile({
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    })).rejects.toThrow(/unrecognized partition payload/);
  });

  test('splits PDFs into page batches and merges partition results in page order', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as FormData;
      const startingPageNumber = Number(body.get('starting_page_number'));

      return jsonResponse([
        {
          type: 'NarrativeText',
          element_id: `el_${startingPageNumber}`,
          text: `batch starting at page ${startingPageNumber}`,
          metadata: { page_number: startingPageNumber },
        },
      ]);
    });

    const client = createUnstructuredClient({
      baseUrl: 'http://unstructured.local',
      partitionOptions: {
        splitPdfPage: true,
        splitPdfBatchSize: 2,
        splitPdfConcurrencyLevel: 2,
      },
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await client.partitionFile({
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      fileData: await makePdf(5),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.map(element => element.text)).toEqual([
      'batch starting at page 1',
      'batch starting at page 3',
      'batch starting at page 5',
    ]);

    const bodies = fetchMock.mock.calls.map(call => call[1]?.body as FormData);
    expect(bodies.map(body => body.get('starting_page_number'))).toEqual(['1', '3', '5']);
  });
});

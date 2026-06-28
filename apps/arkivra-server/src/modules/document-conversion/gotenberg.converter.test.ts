import { describe, expect, test, vi } from 'vitest';
import { createGotenbergDocumentConverter } from './gotenberg.converter.js';

describe('gotenberg document converter', () => {
  test('reports healthy when the health endpoint succeeds', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const converter = createGotenbergDocumentConverter({
      baseUrl: 'http://gotenberg:3000/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(converter.checkHealth()).resolves.toMatchObject({
      configured: true,
      healthy: true,
      provider: 'gotenberg',
      url: 'http://gotenberg:3000',
      error: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://gotenberg:3000/health', { method: 'GET' });
  });

  test('reports unhealthy instead of throwing when health fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const converter = createGotenbergDocumentConverter({
      baseUrl: 'http://gotenberg:3000',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(converter.checkHealth()).resolves.toMatchObject({
      configured: true,
      healthy: false,
      error: 'connect ECONNREFUSED',
    });
  });

  test('converts office input to a PDF result', async () => {
    const pdfBytes = Buffer.from('%PDF-test');
    const fetchImpl = vi.fn(async () => new Response(pdfBytes, { status: 200 }));
    const converter = createGotenbergDocumentConverter({
      baseUrl: 'http://gotenberg:3000',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await converter.convertToPdf({
      fileName: 'Contract.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileData: Buffer.from('docx'),
    });

    expect(result).toEqual({
      fileData: pdfBytes,
      fileName: 'Contract.preview.pdf',
      mimeType: 'application/pdf',
      converter: 'gotenberg',
      converterVersion: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://gotenberg:3000/forms/libreoffice/convert',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('rejects unsupported input before calling Gotenberg', async () => {
    const fetchImpl = vi.fn();
    const converter = createGotenbergDocumentConverter({
      baseUrl: 'http://gotenberg:3000',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      converter.convertToPdf({
        fileName: 'Contract.pdf',
        mimeType: 'application/pdf',
        fileData: Buffer.from('%PDF-test'),
      }),
    ).rejects.toThrow('Unsupported Office conversion input');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

import { isOfficeDocumentConvertible, previewPdfFileName } from './office-formats.js';
import type {
  DocumentConversionInput,
  DocumentConversionResult,
  DocumentConverter,
  DocumentConverterHealth,
} from './document-converter.types.js';

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function readErrorBody(response: Response) {
  return await response.text().catch(() => '');
}

export function createGotenbergDocumentConverter({
  baseUrl,
  fetchImpl = fetch,
}: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): DocumentConverter {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const provider = 'gotenberg';

  async function checkHealth(): Promise<DocumentConverterHealth> {
    const checkedAt = new Date().toISOString();

    try {
      const response = await fetchImpl(`${normalizedBaseUrl}/health`, { method: 'GET' });
      if (!response.ok) {
        return {
          configured: true,
          healthy: false,
          provider,
          url: normalizedBaseUrl,
          checkedAt,
          error: `${response.status} ${response.statusText}`,
        };
      }

      return {
        configured: true,
        healthy: true,
        provider,
        url: normalizedBaseUrl,
        checkedAt,
        error: null,
      };
    } catch (error) {
      return {
        configured: true,
        healthy: false,
        provider,
        url: normalizedBaseUrl,
        checkedAt,
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  async function convertToPdf({
    fileName,
    mimeType,
    fileData,
  }: DocumentConversionInput): Promise<DocumentConversionResult> {
    if (!isOfficeDocumentConvertible({ fileName, mimeType })) {
      throw new Error(`Unsupported Office conversion input: ${fileName} (${mimeType})`);
    }

    const formData = new FormData();
    formData.append('files', new Blob([fileData], { type: mimeType }), fileName);

    const response = await fetchImpl(`${normalizedBaseUrl}/forms/libreoffice/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new Error(
        `Gotenberg conversion failed: ${response.status} ${response.statusText}${body.length > 0 ? ` - ${body}` : ''}`,
      );
    }

    return {
      fileData: Buffer.from(await response.arrayBuffer()),
      fileName: previewPdfFileName(fileName),
      mimeType: 'application/pdf',
      converter: provider,
      converterVersion: null,
    };
  }

  return {
    provider,
    baseUrl: normalizedBaseUrl,
    checkHealth,
    convertToPdf,
  };
}

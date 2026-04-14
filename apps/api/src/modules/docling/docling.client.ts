export type DoclingConvertResponse = {
  document: {
    md_content: string;
    text_content: string;
    json_content: Record<string, unknown>;
    html_content: string;
    doctags_content: string;
  };
  status: 'success' | 'partial_success' | 'skipped' | 'failure';
  processing_time: number;
  errors: string[];
};

export type DoclingClient = ReturnType<typeof createDoclingClient>;

export function createDoclingClient({ baseUrl }: { baseUrl: string }) {
  async function convertFile({
    fileName,
    mimeType,
    fileData,
  }: {
    fileName: string;
    mimeType: string;
    fileData: Buffer;
  }): Promise<DoclingConvertResponse> {
    const formData = new FormData();

    const blob = new Blob([fileData], { type: mimeType });
    formData.append('files', blob, fileName);
    formData.append('to_formats', 'text');
    formData.append('do_ocr', 'true');
    formData.append('ocr_engine', 'easyocr');
    formData.append('table_mode', 'fast');
    formData.append('abort_on_error', 'false');

    const url = `${baseUrl}/v1/convert/file`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      throw new Error(`Docling request failed for ${url}: ${message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Docling API error: ${response.status} ${response.statusText} - ${text}`);
    }

    const data = (await response.json()) as DoclingConvertResponse;

    if (data.status === 'failure') {
      throw new Error(`Docling conversion failed: ${data.errors.join(', ')}`);
    }

    return data;
  }

  return { convertFile };
}

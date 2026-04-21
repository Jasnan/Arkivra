import type { DoclingConvertResponse } from '../parsing/adapters/docling.schema.js';
import {
  doclingConvertResponseSchema,
  doclingStatusResponseSchema,
  doclingSubmitResponseSchema,
  isTerminalInternalStatus,
  normalizeDoclingTaskStatus,
} from '../parsing/adapters/docling.schema.js';

export type { DoclingConvertResponse } from '../parsing/adapters/docling.schema.js';

export type DoclingClient = ReturnType<typeof createDoclingClient>;

export type DoclingConvertOptions = {
  /** Comma-separated output formats to request. */
  toFormats: string;
  /** Whether to run OCR. */
  doOcr: boolean;
  /** Docling OCR engine name. */
  ocrEngine: string;
  /** Docling table extraction mode. */
  tableMode: string;
  /** Whether Docling should abort on the first error. */
  abortOnError: boolean;
};

export const DEFAULT_DOCLING_CONVERT_OPTIONS: DoclingConvertOptions = {
  toFormats: 'text',
  doOcr: true,
  ocrEngine: 'easyocr',
  tableMode: 'fast',
  abortOnError: false,
};

export type DoclingRoutes = {
  submitAsync: (baseUrl: string) => string;
  pollStatus: (baseUrl: string, taskId: string) => string;
  fetchResult: (baseUrl: string, taskId: string) => string;
};

export const DEFAULT_DOCLING_ROUTES: DoclingRoutes = {
  submitAsync: (baseUrl) => `${baseUrl}/v1/convert/file/async`,
  pollStatus: (baseUrl, taskId) => `${baseUrl}/v1/status/poll/${taskId}`,
  fetchResult: (baseUrl, taskId) => `${baseUrl}/v1/result/${taskId}`,
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function collectTaskErrors(payload: { errors?: string[]; task_meta?: Record<string, unknown> | null }) {
  const directErrors = Array.isArray(payload.errors) ? payload.errors : [];
  const metaErrors = payload.task_meta?.errors;
  const taskMetaErrors = Array.isArray(metaErrors)
    ? metaErrors.filter((value): value is string => typeof value === 'string')
    : [];

  return [...directErrors, ...taskMetaErrors];
}

export function createDoclingClient({
  baseUrl,
  pollIntervalMs = 2_000,
  maxWaitMs = 6 * 60 * 60 * 1000,
  convertOptions = DEFAULT_DOCLING_CONVERT_OPTIONS,
  routes = DEFAULT_DOCLING_ROUTES,
  fetchImpl = fetch,
  sleepImpl = sleep,
}: {
  baseUrl: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  convertOptions?: DoclingConvertOptions;
  routes?: DoclingRoutes;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<unknown>;
}) {
  async function readErrorText(response: Response) {
    return await response.text().catch(() => '');
  }

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
    formData.append('to_formats', convertOptions.toFormats);
    formData.append('do_ocr', String(convertOptions.doOcr));
    formData.append('ocr_engine', convertOptions.ocrEngine);
    formData.append('table_mode', convertOptions.tableMode);
    formData.append('abort_on_error', String(convertOptions.abortOnError));

    const submitUrl = routes.submitAsync(baseUrl);
    let submitResponse: Response;

    try {
      submitResponse = await fetchImpl(submitUrl, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      throw new Error(`Docling async submit failed for ${submitUrl}: ${message}`);
    }

    if (!submitResponse.ok) {
      const text = await readErrorText(submitResponse);
      throw new Error(`Docling async submit error: ${submitResponse.status} ${submitResponse.statusText} - ${text}`);
    }

    const submitJson = await submitResponse.json().catch(() => null);
    const submitParsed = doclingSubmitResponseSchema.safeParse(submitJson);
    if (!submitParsed.success) {
      throw new Error(
        `Docling async submit returned an unrecognized payload: ${submitParsed.error.message}`,
      );
    }

    const taskId = submitParsed.data.task_id;
    let latestRawStatus = submitParsed.data.task_status;
    let latestStatusPayload: { errors?: string[]; task_meta?: Record<string, unknown> | null } = {};
    let latestInternalStatus = normalizeDoclingTaskStatus(latestRawStatus);

    if (latestInternalStatus === 'unknown') {
      throw new Error(
        `Docling async submit returned unknown task_status "${latestRawStatus}" for task ${taskId}`,
      );
    }

    const startedAt = Date.now();

    while (!isTerminalInternalStatus(latestInternalStatus)) {
      if (Date.now() - startedAt > maxWaitMs) {
        throw new Error(
          `Docling async conversion exceeded Arkivra max wait of ${maxWaitMs}ms for task ${taskId}`,
        );
      }

      await sleepImpl(pollIntervalMs);

      const pollUrl = routes.pollStatus(baseUrl, taskId);
      let statusResponse: Response;
      try {
        statusResponse = await fetchImpl(pollUrl, { method: 'GET' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown fetch error';
        throw new Error(`Docling async status poll failed for task ${taskId}: ${message}`);
      }

      if (!statusResponse.ok) {
        const text = await readErrorText(statusResponse);
        throw new Error(
          `Docling async status poll error for task ${taskId}: ${statusResponse.status} ${statusResponse.statusText} - ${text}`,
        );
      }

      const statusJson = await statusResponse.json().catch(() => null);
      const statusParsed = doclingStatusResponseSchema.safeParse(statusJson);
      if (!statusParsed.success) {
        throw new Error(
          `Docling async status poll returned an unrecognized payload for task ${taskId}: ${statusParsed.error.message}`,
        );
      }

      latestRawStatus = statusParsed.data.task_status;
      latestStatusPayload = {
        errors: statusParsed.data.errors,
        task_meta: statusParsed.data.task_meta ?? null,
      };
      latestInternalStatus = normalizeDoclingTaskStatus(latestRawStatus);

      if (latestInternalStatus === 'unknown') {
        throw new Error(
          `Docling async poll returned unknown task_status "${latestRawStatus}" for task ${taskId}`,
        );
      }
    }

    if (latestInternalStatus !== 'succeeded') {
      const errors = collectTaskErrors(latestStatusPayload);
      throw new Error(
        `Docling async conversion failed for task ${taskId}${errors.length > 0 ? `: ${errors.join(', ')}` : ''}`,
      );
    }

    const resultUrl = routes.fetchResult(baseUrl, taskId);
    let resultResponse: Response;
    try {
      resultResponse = await fetchImpl(resultUrl, { method: 'GET' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      throw new Error(`Docling async result fetch failed for task ${taskId}: ${message}`);
    }

    if (!resultResponse.ok) {
      const text = await readErrorText(resultResponse);
      throw new Error(
        `Docling async result fetch error for task ${taskId}: ${resultResponse.status} ${resultResponse.statusText} - ${text}`,
      );
    }

    const resultJson = await resultResponse.json().catch(() => null);
    const resultParsed = doclingConvertResponseSchema.safeParse(resultJson);
    if (!resultParsed.success) {
      throw new Error(
        `Docling returned an unrecognized result payload for task ${taskId}: ${resultParsed.error.message}`,
      );
    }

    const data = resultParsed.data;
    const resultInternalStatus = normalizeDoclingTaskStatus(data.status);
    if (resultInternalStatus === 'failed') {
      throw new Error(`Docling conversion failed: ${data.errors.join(', ')}`);
    }

    return data;
  }

  return { convertFile };
}

import type {
  DoclingChunkResponse,
  DoclingConvertResponse,
} from '../parsing/adapters/docling.schema.js';
import {
  doclingChunkResponseSchema,
  doclingConvertResponseSchema,
  doclingStatusResponseSchema,
  doclingSubmitResponseSchema,
  isTerminalInternalStatus,
  normalizeDoclingTaskStatus,
} from '../parsing/adapters/docling.schema.js';
import { sha256Hex } from '../parsing/binary-diagnostics.js';

export type {
  DoclingChunkResponse,
  DoclingConvertResponse,
} from '../parsing/adapters/docling.schema.js';

export type DoclingClient = ReturnType<typeof createDoclingClient>;
export type DoclingChunker = 'hybrid' | 'hierarchical';
export type DoclingProcessingPipeline = 'legacy' | 'standard' | 'vlm' | 'asr';

export type DoclingConvertOptions = {
  toFormats: string[];
  doOcr: boolean;
  ocrPreset?: string;
  ocrLang?: string[];
  pipeline?: DoclingProcessingPipeline;
  vlmPipelinePreset?: string;
  vlmPipelineCustomConfig?: string;
};

export const DEFAULT_DOCLING_CONVERT_OPTIONS: DoclingConvertOptions = {
  toFormats: ['json', 'md'],
  doOcr: true,
  ocrPreset: 'auto',
};

export type DoclingChunkOptions = {
  maxTokens: number;
  mergePeers: boolean;
  includeRawText: boolean;
};

export const DEFAULT_DOCLING_CHUNK_OPTIONS: DoclingChunkOptions = {
  maxTokens: 512,
  mergePeers: true,
  includeRawText: true,
};

export type DoclingRoutes = {
  submitAsync: (baseUrl: string) => string;
  pollStatus: (baseUrl: string, taskId: string) => string;
  fetchResult: (baseUrl: string, taskId: string) => string;
  hybridChunkSubmitAsync: (baseUrl: string) => string;
  hierarchicalChunkSubmitAsync: (baseUrl: string) => string;
};

export const DEFAULT_DOCLING_ROUTES: DoclingRoutes = {
  submitAsync: (baseUrl) => `${baseUrl}/v1/convert/file/async`,
  pollStatus: (baseUrl, taskId) => `${baseUrl}/v1/status/poll/${taskId}`,
  fetchResult: (baseUrl, taskId) => `${baseUrl}/v1/result/${taskId}`,
  hybridChunkSubmitAsync: (baseUrl) => `${baseUrl}/v1/chunk/hybrid/file/async`,
  hierarchicalChunkSubmitAsync: (baseUrl) => `${baseUrl}/v1/chunk/hierarchical/file/async`,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DoclingTaskErrorPayload = {
  errors?: string[];
  error_message?: string | null;
  failure?: unknown;
  task_meta?: Record<string, unknown> | null;
};

function stringifyTaskError(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message =
      record.message ??
      record.error_message ??
      record.exception_message ??
      record.detail ??
      record.msg ??
      record.code;

    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function collectTaskErrors(payload: DoclingTaskErrorPayload) {
  const directErrors = Array.isArray(payload.errors) ? payload.errors : [];
  const metaErrors = payload.task_meta?.errors;
  const directErrorMessage = stringifyTaskError(payload.error_message);
  const failureMessage = stringifyTaskError(payload.failure);
  const metaErrorMessage = stringifyTaskError(payload.task_meta?.error_message);
  const taskMetaMessage = stringifyTaskError(payload.task_meta);
  const taskMetaErrors = Array.isArray(metaErrors)
    ? metaErrors.map(stringifyTaskError).filter((value): value is string => value !== null)
    : [];

  return [
    directErrorMessage,
    ...directErrors,
    failureMessage,
    metaErrorMessage,
    ...taskMetaErrors,
    taskMetaMessage,
  ].filter((value): value is string => value !== null && value.trim().length > 0);
}

function assertTaskIdMatches({
  expectedTaskId,
  actualTaskId,
  operation,
}: {
  expectedTaskId: string;
  actualTaskId: string | undefined;
  operation: string;
}) {
  if (actualTaskId !== undefined && actualTaskId !== expectedTaskId) {
    throw new Error(
      `Docling ${operation} returned task_id "${actualTaskId}" while awaiting task "${expectedTaskId}"`,
    );
  }
}

export function createDoclingClient({
  baseUrl,
  pollIntervalMs = 2_000,
  maxWaitMs = 6 * 60 * 60 * 1000,
  requestRetryAttempts = 2,
  requestRetryDelayMs = 3_000,
  transientFetchGraceMs = 10 * 60 * 1000,
  chunkTaskRecoveryAttempts = 2,
  convertOptions = DEFAULT_DOCLING_CONVERT_OPTIONS,
  routes = DEFAULT_DOCLING_ROUTES,
  fetchImpl = fetch,
  sleepImpl = sleep,
}: {
  baseUrl: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  requestRetryAttempts?: number;
  requestRetryDelayMs?: number;
  transientFetchGraceMs?: number;
  chunkTaskRecoveryAttempts?: number;
  convertOptions?: Partial<DoclingConvertOptions>;
  routes?: DoclingRoutes;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<unknown>;
}) {
  const effectiveConvertOptions: DoclingConvertOptions = {
    ...DEFAULT_DOCLING_CONVERT_OPTIONS,
    ...convertOptions,
  };
  const logPrefix = '[docling-client]';

  async function readErrorText(response: Response) {
    return await response.text().catch(() => '');
  }

  function isRecoverableChunkTaskLoss(error: Error) {
    return /Docling chunk async status poll error .*404 Not Found .*Task not found/i.test(
      error.message,
    );
  }

  async function fetchWithRetry(
    url: string,
    init: RequestInit,
    errorPrefix: string,
  ): Promise<Response> {
    let attempt = 0;

    while (true) {
      try {
        return await fetchImpl(url, init);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown fetch error';
        if (attempt >= requestRetryAttempts) {
          throw new Error(`${errorPrefix}: ${message}`);
        }

        attempt += 1;
        await sleepImpl(requestRetryDelayMs);
      }
    }
  }

  async function fetchWithTransientGrace({
    url,
    init,
    errorPrefix,
    taskId,
    operation,
    startedAt,
  }: {
    url: string;
    init: RequestInit;
    errorPrefix: string;
    taskId: string;
    operation: string;
    startedAt: number;
  }): Promise<Response> {
    let firstFailureAt: number | null = null;

    while (true) {
      try {
        const response = await fetchWithRetry(url, init, errorPrefix);

        if (response.status < 500) {
          return response;
        }

        const text = await readErrorText(response);
        throw new Error(`${errorPrefix}: ${response.status} ${response.statusText} - ${text}`);
      } catch (error) {
        const now = Date.now();
        const message = error instanceof Error ? error.message : 'Unknown fetch error';
        firstFailureAt ??= now;

        const failureElapsedMs = now - firstFailureAt;
        const taskElapsedMs = now - startedAt;

        if (failureElapsedMs >= transientFetchGraceMs || taskElapsedMs > maxWaitMs) {
          throw error;
        }

        console.warn(
          `${logPrefix} ${operation} transient fetch failure taskId=${taskId} elapsedMs=${taskElapsedMs} failureElapsedMs=${failureElapsedMs} graceMs=${transientFetchGraceMs} reason=${message}`,
        );
        await sleepImpl(pollIntervalMs);
      }
    }
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
    console.info(
      `${logPrefix} convert request file="${fileName}" mime=${mimeType} bytes=${fileData.length} sha256=${sha256Hex(fileData)} blobSize=${blob.size}`,
    );

    formData.append('files', blob, fileName);
    for (const format of effectiveConvertOptions.toFormats) {
      formData.append('to_formats', format);
    }
    formData.append('include_images', 'true');
    formData.append('image_export_mode', 'embedded');
    formData.append('do_ocr', String(effectiveConvertOptions.doOcr));
    if (effectiveConvertOptions.pipeline !== undefined) {
      formData.append('pipeline', effectiveConvertOptions.pipeline);
    }
    if (effectiveConvertOptions.vlmPipelinePreset !== undefined) {
      formData.append('vlm_pipeline_preset', effectiveConvertOptions.vlmPipelinePreset);
    }
    if (effectiveConvertOptions.vlmPipelineCustomConfig !== undefined) {
      formData.append(
        'vlm_pipeline_custom_config',
        effectiveConvertOptions.vlmPipelineCustomConfig,
      );
    }
    if (effectiveConvertOptions.ocrPreset !== undefined) {
      formData.append('ocr_preset', effectiveConvertOptions.ocrPreset);
    }
    for (const language of effectiveConvertOptions.ocrLang ?? []) {
      formData.append('ocr_lang', language);
    }

    const submitUrl = routes.submitAsync(baseUrl);
    const submitResponse = await fetchWithRetry(
      submitUrl,
      {
        method: 'POST',
        body: formData,
      },
      `Docling async submit failed for ${submitUrl}`,
    );

    if (!submitResponse.ok) {
      const text = await readErrorText(submitResponse);
      throw new Error(
        `Docling async submit error: ${submitResponse.status} ${submitResponse.statusText} - ${text}`,
      );
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
    let latestStatusPayload: DoclingTaskErrorPayload = {
      errors: submitParsed.data.errors,
      error_message: submitParsed.data.error_message,
      failure: submitParsed.data.failure,
      task_meta: submitParsed.data.task_meta ?? null,
    };
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
      const statusResponse = await fetchWithTransientGrace({
        url: pollUrl,
        init: { method: 'GET' },
        errorPrefix: `Docling async status poll failed for task ${taskId}`,
        taskId,
        operation: 'async status poll',
        startedAt,
      });

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
      assertTaskIdMatches({
        expectedTaskId: taskId,
        actualTaskId: statusParsed.data.task_id,
        operation: 'async status poll',
      });

      latestRawStatus = statusParsed.data.task_status;
      latestStatusPayload = {
        errors: statusParsed.data.errors,
        error_message: statusParsed.data.error_message,
        failure: statusParsed.data.failure,
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
    const resultResponse = await fetchWithTransientGrace({
      url: resultUrl,
      init: { method: 'GET' },
      errorPrefix: `Docling async result fetch failed for task ${taskId}`,
      taskId,
      operation: 'async result fetch',
      startedAt,
    });

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
    assertTaskIdMatches({
      expectedTaskId: taskId,
      actualTaskId: resultParsed.data.task_id,
      operation: 'async result fetch',
    });

    const data = resultParsed.data;
    const resultInternalStatus = normalizeDoclingTaskStatus(data.status);
    if (resultInternalStatus === 'failed') {
      throw new Error(`Docling conversion failed: ${data.errors.join(', ')}`);
    }

    return data;
  }

  async function chunkFile({
    fileName,
    mimeType,
    fileData,
    chunker = 'hybrid',
    chunkOptions,
    convertOptions,
  }: {
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    chunker?: DoclingChunker;
    chunkOptions?: Partial<DoclingChunkOptions>;
    convertOptions?: Partial<
      Pick<
        DoclingConvertOptions,
        'doOcr' | 'ocrPreset' | 'pipeline' | 'vlmPipelinePreset' | 'vlmPipelineCustomConfig'
      >
    >;
  }): Promise<DoclingChunkResponse> {
    const effectiveChunkOptions: DoclingChunkOptions = {
      ...DEFAULT_DOCLING_CHUNK_OPTIONS,
      ...chunkOptions,
    };
    const effectiveChunkConvertOptions = {
      doOcr: convertOptions?.doOcr ?? effectiveConvertOptions.doOcr,
      ocrPreset: convertOptions?.ocrPreset ?? effectiveConvertOptions.ocrPreset,
      pipeline: convertOptions?.pipeline ?? effectiveConvertOptions.pipeline,
      vlmPipelinePreset:
        convertOptions?.vlmPipelinePreset ?? effectiveConvertOptions.vlmPipelinePreset,
      vlmPipelineCustomConfig:
        convertOptions?.vlmPipelineCustomConfig ?? effectiveConvertOptions.vlmPipelineCustomConfig,
    };

    async function submitAndAwaitChunkTask() {
      console.info(
        `${logPrefix} submitting ${chunker} chunk task file="${fileName}" mime=${mimeType} bytes=${fileData.length} sha256=${sha256Hex(fileData)} doOcr=${effectiveChunkConvertOptions.doOcr} ocrPreset=${effectiveChunkConvertOptions.ocrPreset ?? 'none'} pipeline=${effectiveChunkConvertOptions.pipeline ?? 'default'} maxTokens=${chunker === 'hybrid' ? effectiveChunkOptions.maxTokens : 'n/a'}`,
      );
      const formData = new FormData();
      const blob = new Blob([fileData], { type: mimeType });
      console.info(
        `${logPrefix} multipart payload file="${fileName}" mime=${mimeType} bytes=${fileData.length} sha256=${sha256Hex(fileData)} blobSize=${blob.size}`,
      );

      formData.append('files', blob, fileName);
      formData.append('include_converted_doc', 'true');
      formData.append('target_type', 'inbody');
      formData.append('convert_include_images', 'true');
      formData.append('convert_image_export_mode', 'embedded');
      formData.append('convert_do_ocr', String(effectiveChunkConvertOptions.doOcr));
      if (effectiveChunkConvertOptions.pipeline !== undefined) {
        formData.append('convert_pipeline', effectiveChunkConvertOptions.pipeline);
      }
      if (effectiveChunkConvertOptions.vlmPipelinePreset !== undefined) {
        formData.append(
          'convert_vlm_pipeline_preset',
          effectiveChunkConvertOptions.vlmPipelinePreset,
        );
      }
      if (effectiveChunkConvertOptions.vlmPipelineCustomConfig !== undefined) {
        formData.append(
          'convert_vlm_pipeline_custom_config',
          effectiveChunkConvertOptions.vlmPipelineCustomConfig,
        );
      }
      if (effectiveChunkConvertOptions.ocrPreset !== undefined) {
        formData.append('convert_ocr_preset', effectiveChunkConvertOptions.ocrPreset);
      }
      for (const language of effectiveConvertOptions.ocrLang ?? []) {
        formData.append('convert_ocr_lang', language);
      }

      formData.append('chunking_include_raw_text', String(effectiveChunkOptions.includeRawText));
      if (chunker === 'hybrid') {
        formData.append('chunking_max_tokens', String(effectiveChunkOptions.maxTokens));
        formData.append('chunking_merge_peers', String(effectiveChunkOptions.mergePeers));
      }

      const submitUrl =
        chunker === 'hybrid'
          ? routes.hybridChunkSubmitAsync(baseUrl)
          : routes.hierarchicalChunkSubmitAsync(baseUrl);
      const submitResponse = await fetchWithRetry(
        submitUrl,
        {
          method: 'POST',
          body: formData,
        },
        `Docling chunk async submit failed for ${submitUrl}`,
      );

      if (!submitResponse.ok) {
        const text = await readErrorText(submitResponse);
        throw new Error(
          `Docling chunk async submit error: ${submitResponse.status} ${submitResponse.statusText} - ${text}`,
        );
      }

      const submitJson = await submitResponse.json().catch(() => null);
      const submitParsed = doclingSubmitResponseSchema.safeParse(submitJson);
      if (!submitParsed.success) {
        throw new Error(
          `Docling chunk async submit returned an unrecognized payload: ${submitParsed.error.message}`,
        );
      }

      const taskId = submitParsed.data.task_id;
      let latestRawStatus = submitParsed.data.task_status;
      let latestStatusPayload: DoclingTaskErrorPayload = {
        errors: submitParsed.data.errors,
        error_message: submitParsed.data.error_message,
        failure: submitParsed.data.failure,
        task_meta: submitParsed.data.task_meta ?? null,
      };
      let latestInternalStatus = normalizeDoclingTaskStatus(latestRawStatus);

      if (latestInternalStatus === 'unknown') {
        throw new Error(
          `Docling chunk async submit returned unknown task_status "${latestRawStatus}" for task ${taskId}`,
        );
      }
      console.info(
        `${logPrefix} ${chunker} chunk task accepted taskId=${taskId} status=${latestRawStatus}`,
      );

      const startedAt = Date.now();
      let pollCount = 0;

      while (!isTerminalInternalStatus(latestInternalStatus)) {
        if (Date.now() - startedAt > maxWaitMs) {
          throw new Error(
            `Docling chunk async conversion exceeded Arkivra max wait of ${maxWaitMs}ms for task ${taskId}`,
          );
        }

        await sleepImpl(pollIntervalMs);

        const pollUrl = routes.pollStatus(baseUrl, taskId);
        const statusResponse = await fetchWithTransientGrace({
          url: pollUrl,
          init: { method: 'GET' },
          errorPrefix: `Docling chunk async status poll failed for task ${taskId}`,
          taskId,
          operation: 'chunk status poll',
          startedAt,
        });

        if (!statusResponse.ok) {
          const text = await readErrorText(statusResponse);
          throw new Error(
            `Docling chunk async status poll error for task ${taskId}: ${statusResponse.status} ${statusResponse.statusText} - ${text}`,
          );
        }

        const statusJson = await statusResponse.json().catch(() => null);
        const statusParsed = doclingStatusResponseSchema.safeParse(statusJson);
        if (!statusParsed.success) {
          throw new Error(
            `Docling chunk async status poll returned an unrecognized payload for task ${taskId}: ${statusParsed.error.message}`,
          );
        }
        assertTaskIdMatches({
          expectedTaskId: taskId,
          actualTaskId: statusParsed.data.task_id,
          operation: 'chunk async status poll',
        });

        latestRawStatus = statusParsed.data.task_status;
        latestStatusPayload = {
          errors: statusParsed.data.errors,
          error_message: statusParsed.data.error_message,
          failure: statusParsed.data.failure,
          task_meta: statusParsed.data.task_meta ?? null,
        };
        latestInternalStatus = normalizeDoclingTaskStatus(latestRawStatus);

        if (latestInternalStatus === 'unknown') {
          throw new Error(
            `Docling chunk async poll returned unknown task_status "${latestRawStatus}" for task ${taskId}`,
          );
        }

        pollCount += 1;
        if (
          pollCount === 1 ||
          pollCount % 10 === 0 ||
          isTerminalInternalStatus(latestInternalStatus)
        ) {
          console.info(
            `${logPrefix} ${chunker} chunk task poll taskId=${taskId} status=${latestRawStatus} elapsedMs=${Date.now() - startedAt}`,
          );
        }
      }

      if (latestInternalStatus !== 'succeeded') {
        const errors = collectTaskErrors(latestStatusPayload);
        throw new Error(
          `Docling chunk async conversion failed for task ${taskId}${errors.length > 0 ? `: ${errors.join(', ')}` : ''}`,
        );
      }

      const resultUrl = routes.fetchResult(baseUrl, taskId);
      const resultResponse = await fetchWithTransientGrace({
        url: resultUrl,
        init: { method: 'GET' },
        errorPrefix: `Docling chunk async result fetch failed for task ${taskId}`,
        taskId,
        operation: 'chunk result fetch',
        startedAt,
      });

      if (!resultResponse.ok) {
        const text = await readErrorText(resultResponse);
        throw new Error(
          `Docling chunk async result fetch error for task ${taskId}: ${resultResponse.status} ${resultResponse.statusText} - ${text}`,
        );
      }

      const resultJson = await resultResponse.json().catch(() => null);
      const resultParsed = doclingChunkResponseSchema.safeParse(resultJson);
      if (!resultParsed.success) {
        throw new Error(
          `Docling chunk returned an unrecognized result payload for task ${taskId}: ${resultParsed.error.message}`,
        );
      }
      assertTaskIdMatches({
        expectedTaskId: taskId,
        actualTaskId: resultParsed.data.task_id,
        operation: 'chunk async result fetch',
      });

      const data = resultParsed.data;
      const firstDoc = data.documents[0];
      if (firstDoc !== undefined && normalizeDoclingTaskStatus(firstDoc.status) === 'failed') {
        throw new Error(`Docling chunk conversion failed: ${firstDoc.errors.join(', ')}`);
      }

      console.info(
        `${logPrefix} ${chunker} chunk task completed taskId=${taskId} chunks=${data.chunks.length} processingTime=${data.processing_time}`,
      );

      return data;
    }

    let recoveryAttempt = 0;

    while (true) {
      try {
        return await submitAndAwaitChunkTask();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !isRecoverableChunkTaskLoss(error) ||
          recoveryAttempt >= chunkTaskRecoveryAttempts
        ) {
          throw error;
        }

        recoveryAttempt += 1;
        console.warn(
          `${logPrefix} ${chunker} chunk task lost; resubmitting file="${fileName}" recoveryAttempt=${recoveryAttempt}/${chunkTaskRecoveryAttempts} reason=${error.message}`,
        );
      }
    }
  }

  return { convertFile, chunkFile };
}

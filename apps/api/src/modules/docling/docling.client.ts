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

type DoclingAsyncTaskStatus =
  | 'pending'
  | 'queued'
  | 'started'
  | 'processing'
  | 'success'
  | 'failure'
  | 'canceled';

type DoclingAsyncSubmitResponse = {
  task_id: string;
  task_status: DoclingAsyncTaskStatus;
};

type DoclingAsyncStatusResponse = {
  task_id: string;
  task_status: DoclingAsyncTaskStatus;
  task_position?: number | null;
  task_meta?: Record<string, unknown> | null;
  errors?: string[];
};

export type DoclingClient = ReturnType<typeof createDoclingClient>;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTerminalTaskStatus(status: string) {
  return status === 'success' || status === 'failure' || status === 'canceled';
}

function collectTaskErrors(payload: { errors?: string[]; task_meta?: Record<string, unknown> | null }) {
  const directErrors = Array.isArray(payload.errors) ? payload.errors : [];
  const taskMetaErrors = Array.isArray(payload.task_meta?.errors)
    ? payload.task_meta.errors.filter((value): value is string => typeof value === 'string')
    : [];

  return [...directErrors, ...taskMetaErrors];
}

export function createDoclingClient({
  baseUrl,
  pollIntervalMs = 2_000,
  maxWaitMs = 6 * 60 * 60 * 1000,
  fetchImpl = fetch,
  sleepImpl = sleep,
}: {
  baseUrl: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
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
    formData.append('to_formats', 'text');
    formData.append('do_ocr', 'true');
    formData.append('ocr_engine', 'easyocr');
    formData.append('table_mode', 'fast');
    formData.append('abort_on_error', 'false');

    let submitResponse: Response;

    try {
      submitResponse = await fetchImpl(`${baseUrl}/v1/convert/file/async`, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      throw new Error(`Docling async submit failed for ${baseUrl}/v1/convert/file/async: ${message}`);
    }

    if (!submitResponse.ok) {
      const text = await readErrorText(submitResponse);
      throw new Error(`Docling async submit error: ${submitResponse.status} ${submitResponse.statusText} - ${text}`);
    }

    const task = (await submitResponse.json()) as DoclingAsyncSubmitResponse;
    if (!task.task_id) {
      throw new Error('Docling async submit did not return a task_id');
    }

    const startedAt = Date.now();
    let latestStatus: DoclingAsyncStatusResponse = {
      task_id: task.task_id,
      task_status: task.task_status,
    };

    while (!isTerminalTaskStatus(latestStatus.task_status)) {
      if (Date.now() - startedAt > maxWaitMs) {
        throw new Error(
          `Docling async conversion exceeded Arkivra max wait of ${maxWaitMs}ms for task ${task.task_id}`,
        );
      }

      await sleepImpl(pollIntervalMs);

      let statusResponse: Response;
      try {
        statusResponse = await fetchImpl(`${baseUrl}/v1/status/poll/${task.task_id}`, {
          method: 'GET',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown fetch error';
        throw new Error(`Docling async status poll failed for task ${task.task_id}: ${message}`);
      }

      if (!statusResponse.ok) {
        const text = await readErrorText(statusResponse);
        throw new Error(
          `Docling async status poll error for task ${task.task_id}: ${statusResponse.status} ${statusResponse.statusText} - ${text}`,
        );
      }

      latestStatus = (await statusResponse.json()) as DoclingAsyncStatusResponse;
    }

    if (latestStatus.task_status !== 'success') {
      const errors = collectTaskErrors(latestStatus);
      throw new Error(
        `Docling async conversion failed for task ${task.task_id}${errors.length > 0 ? `: ${errors.join(', ')}` : ''}`,
      );
    }

    let resultResponse: Response;
    try {
      resultResponse = await fetchImpl(`${baseUrl}/v1/result/${task.task_id}`, {
        method: 'GET',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      throw new Error(`Docling async result fetch failed for task ${task.task_id}: ${message}`);
    }

    if (!resultResponse.ok) {
      const text = await readErrorText(resultResponse);
      throw new Error(
        `Docling async result fetch error for task ${task.task_id}: ${resultResponse.status} ${resultResponse.statusText} - ${text}`,
      );
    }

    const data = (await resultResponse.json()) as DoclingConvertResponse;
    if (data.status === 'failure') {
      throw new Error(`Docling conversion failed: ${data.errors.join(', ')}`);
    }

    return data;
  }

  return { convertFile };
}

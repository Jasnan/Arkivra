import type { UnstructuredElement } from '../parsing/adapters/unstructured.schema.js';
import { PDFDocument } from 'pdf-lib';
import { unstructuredPartitionResponseSchema } from '../parsing/adapters/unstructured.schema.js';

export type { UnstructuredElement } from '../parsing/adapters/unstructured.schema.js';

export type UnstructuredClient = ReturnType<typeof createUnstructuredClient>;

export type UnstructuredStrategy = 'fast' | 'hi_res' | 'auto' | 'ocr_only' | 'od_only' | 'vlm';

export type UnstructuredPartitionOptions = {
  strategy: UnstructuredStrategy;
  languages: string[];
  inferTableStructure: boolean;
  extractImageBlockTypes: string[];
  splitPdfPage: boolean;
  splitPdfAllowFailed: boolean;
  splitPdfConcurrencyLevel: number;
  splitPdfBatchSize: number;
};

export const DEFAULT_UNSTRUCTURED_PARTITION_OPTIONS: UnstructuredPartitionOptions = {
  strategy: 'hi_res',
  languages: ['deu', 'eng'],
  inferTableStructure: true,
  extractImageBlockTypes: ['Image'],
  splitPdfPage: true,
  splitPdfAllowFailed: false,
  splitPdfConcurrencyLevel: 5,
  splitPdfBatchSize: 20,
};

export type UnstructuredRoutes = {
  partition: (baseUrl: string) => string;
};

export const DEFAULT_UNSTRUCTURED_ROUTES: UnstructuredRoutes = {
  partition: baseUrl => `${baseUrl}/general/v0/general`,
};

function formatFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unknown fetch error';
  }

  const cause = error.cause;
  if (cause instanceof Error && cause.message.length > 0) {
    return `${error.message}: ${cause.message}`;
  }

  if (
    cause !== null
    && typeof cause === 'object'
    && 'code' in cause
    && typeof cause.code === 'string'
  ) {
    return `${error.message}: ${cause.code}`;
  }

  return error.message;
}

function isPdfFile({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  return mimeType.toLowerCase() === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function splitPdfIntoBatches({
  fileData,
  fileName,
  batchSize,
}: {
  fileData: Buffer;
  fileName: string;
  batchSize: number;
}) {
  const source = await PDFDocument.load(fileData, { ignoreEncryption: true });
  const totalPages = source.getPageCount();
  const effectiveBatchSize = clampInteger(batchSize, 1, 50);
  const batches: Array<{
    fileName: string;
    fileData: Buffer;
    startPageNumber: number;
    endPageNumber: number;
  }> = [];

  for (let startIndex = 0; startIndex < totalPages; startIndex += effectiveBatchSize) {
    const endIndexExclusive = Math.min(startIndex + effectiveBatchSize, totalPages);
    const target = await PDFDocument.create();
    const pageIndexes = Array.from(
      { length: endIndexExclusive - startIndex },
      (_value, index) => startIndex + index,
    );
    const pages = await target.copyPages(source, pageIndexes);
    for (const page of pages) {
      target.addPage(page);
    }

    const bytes = await target.save();
    const startPageNumber = startIndex + 1;
    const endPageNumber = endIndexExclusive;
    batches.push({
      fileName: `${fileName.replace(/\.pdf$/i, '')}-pages-${startPageNumber}-${endPageNumber}.pdf`,
      fileData: Buffer.from(bytes),
      startPageNumber,
      endPageNumber,
    });
  }

  return batches;
}

async function mapWithConcurrency<T, U>({
  items,
  concurrency,
  mapper,
}: {
  items: T[];
  concurrency: number;
  mapper: (item: T, index: number) => Promise<U>;
}) {
  const results: U[] = [];
  results.length = items.length;
  const effectiveConcurrency = clampInteger(concurrency, 1, 15);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await mapper(item, index);
    }
  }

  const workers: Array<Promise<void>> = [];
  for (let index = 0; index < Math.min(effectiveConcurrency, items.length); index += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return results;
}

export function createUnstructuredClient({
  baseUrl,
  apiKey,
  partitionOptions = {},
  routes = DEFAULT_UNSTRUCTURED_ROUTES,
  fetchImpl = fetch,
}: {
  baseUrl: string;
  apiKey?: string;
  partitionOptions?: Partial<UnstructuredPartitionOptions>;
  routes?: UnstructuredRoutes;
  fetchImpl?: typeof fetch;
}) {
  const effectivePartitionOptions: UnstructuredPartitionOptions = {
    ...DEFAULT_UNSTRUCTURED_PARTITION_OPTIONS,
    ...partitionOptions,
  };

  async function readErrorText(response: Response) {
    return await response.text().catch(() => '');
  }

  async function partitionFile({
    fileName,
    mimeType,
    fileData,
  }: {
    fileName: string;
    mimeType: string;
    fileData: Buffer;
  }): Promise<UnstructuredElement[]> {
    if (effectivePartitionOptions.splitPdfPage && isPdfFile({ fileName, mimeType })) {
      return await partitionPdfFile({
        fileName,
        mimeType,
        fileData,
      });
    }

    return await partitionSingleFile({
      fileName,
      mimeType,
      fileData,
    });
  }

  async function partitionSingleFile({
    fileName,
    mimeType,
    fileData,
    startingPageNumber,
  }: {
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    startingPageNumber?: number;
  }): Promise<UnstructuredElement[]> {
    const formData = new FormData();
    const blob = new Blob([fileData], { type: mimeType });

    formData.append('files', blob, fileName);
    formData.append('output_format', 'application/json');
    formData.append('strategy', effectivePartitionOptions.strategy);
    formData.append('pdf_infer_table_structure', String(effectivePartitionOptions.inferTableStructure));

    for (const language of effectivePartitionOptions.languages) {
      formData.append('languages', language);
    }

    for (const blockType of effectivePartitionOptions.extractImageBlockTypes) {
      formData.append('extract_image_block_types', blockType);
    }
    if (startingPageNumber !== undefined) {
      formData.append('starting_page_number', String(startingPageNumber));
    }

    const partitionUrl = routes.partition(baseUrl);
    const headers = new Headers({ accept: 'application/json' });
    if (apiKey !== undefined && apiKey.trim().length > 0) {
      headers.set('unstructured-api-key', apiKey);
    }

    let response: Response;
    try {
      response = await fetchImpl(partitionUrl, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (error) {
      const message = formatFetchError(error);
      throw new Error(`Unstructured partition request failed for ${partitionUrl}: ${message}`);
    }

    if (!response.ok) {
      const text = await readErrorText(response);
      throw new Error(
        `Unstructured partition error: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    const json = await response.json().catch(() => null);
    const parsed = unstructuredPartitionResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `Unstructured returned an unrecognized partition payload: ${parsed.error.message}`,
      );
    }

    return parsed.data;
  }

  async function partitionPdfFile({
    fileName,
    mimeType,
    fileData,
  }: {
    fileName: string;
    mimeType: string;
    fileData: Buffer;
  }): Promise<UnstructuredElement[]> {
    const batches = await splitPdfIntoBatches({
      fileData,
      fileName,
      batchSize: effectivePartitionOptions.splitPdfBatchSize,
    });

    if (batches.length <= 1) {
      return await partitionSingleFile({ fileName, mimeType, fileData });
    }

    const batchResults = await mapWithConcurrency({
      items: batches,
      concurrency: effectivePartitionOptions.splitPdfConcurrencyLevel,
      mapper: async (batch) => {
        try {
          return await partitionSingleFile({
            fileName: batch.fileName,
            mimeType,
            fileData: batch.fileData,
            startingPageNumber: batch.startPageNumber,
          });
        } catch (error) {
          if (effectivePartitionOptions.splitPdfAllowFailed) {
            console.warn(
              `Unstructured PDF page batch ${batch.startPageNumber}-${batch.endPageNumber} failed and will be skipped:`,
              error instanceof Error ? error.message : error,
            );
            return [];
          }

          throw error;
        }
      },
    });

    return batchResults.flat();
  }

  return { partitionFile };
}

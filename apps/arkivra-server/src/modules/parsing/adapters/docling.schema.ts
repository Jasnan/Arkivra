import { z } from 'zod';

function stringifyDoclingError(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message = record.message ?? record.error_message ?? record.detail ?? record.msg ?? record.code;

    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

const doclingErrorsSchema = z
  .array(z.unknown())
  .optional()
  .default([])
  .transform(errors => errors.map(stringifyDoclingError));

export const doclingSubmitResponseSchema = z.object({
  task_id: z.string().min(1),
  task_type: z.string().min(1).optional(),
  task_status: z.string().min(1),
  task_position: z.number().int().nullable().optional(),
  task_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  error_message: z.string().nullable().optional(),
  failure: z.unknown().nullable().optional(),
  errors: doclingErrorsSchema.optional(),
});
export type DoclingSubmitResponse = z.infer<typeof doclingSubmitResponseSchema>;

export const doclingStatusResponseSchema = z.object({
  task_id: z.string().min(1),
  task_type: z.string().min(1).optional(),
  task_status: z.string().min(1),
  task_position: z.number().int().nullable().optional(),
  task_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  error_message: z.string().nullable().optional(),
  failure: z.unknown().nullable().optional(),
  errors: doclingErrorsSchema.optional(),
});
export type DoclingStatusResponse = z.infer<typeof doclingStatusResponseSchema>;

const nullableStringToEmpty = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? '');

export const doclingConvertResponseSchema = z.object({
  task_id: z.string().min(1).optional(),
  document: z
    .object({
      md_content: nullableStringToEmpty,
      text_content: nullableStringToEmpty,
      json_content: z.unknown().optional(),
      html_content: nullableStringToEmpty,
      doctags_content: nullableStringToEmpty,
    })
    .passthrough(),
  status: z.string().min(1),
  processing_time: z.number().optional(),
  errors: doclingErrorsSchema,
});
export type DoclingConvertResponse = z.infer<typeof doclingConvertResponseSchema>;

export const INTERNAL_TASK_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'unknown',
] as const;
export type InternalTaskStatus = (typeof INTERNAL_TASK_STATUSES)[number];

const DOCLING_STATUS_MAP: Record<string, InternalTaskStatus> = {
  pending: 'pending',
  queued: 'pending',
  started: 'running',
  processing: 'running',
  success: 'succeeded',
  succeeded: 'succeeded',
  completed: 'succeeded',
  partial_success: 'succeeded',
  failure: 'failed',
  failed: 'failed',
  error: 'failed',
  canceled: 'canceled',
  cancelled: 'canceled',
};

export function normalizeDoclingTaskStatus(raw: string): InternalTaskStatus {
  const key = raw.toLowerCase().trim();
  return DOCLING_STATUS_MAP[key] ?? 'unknown';
}

export function isTerminalInternalStatus(status: InternalTaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

export const doclingChunkResponseSchema = z.object({
  task_id: z.string().min(1).optional(),
  chunks: z.array(
    z.object({
      filename: z.string(),
      chunk_index: z.number().int(),
      text: z.string(),
      raw_text: z.string().nullable().optional(),
      num_tokens: z.number().int().nullable().optional(),
      headings: z.array(z.string()).nullable().optional(),
      captions: z.array(z.string()).nullable().optional(),
      doc_items: z.array(z.string()),
      page_numbers: z.array(z.number().int().min(1)).nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
  documents: z.array(
    z.object({
      kind: z.literal('ExportResult'),
      content: z
        .object({
          md_content: nullableStringToEmpty,
          text_content: nullableStringToEmpty,
          json_content: z.unknown().optional(),
          html_content: nullableStringToEmpty,
          doctags_content: nullableStringToEmpty,
        })
        .passthrough(),
      status: z.string().min(1),
      errors: doclingErrorsSchema,
    }),
  ),
  processing_time: z.number().optional(),
});
export type DoclingChunkResponse = z.infer<typeof doclingChunkResponseSchema>;

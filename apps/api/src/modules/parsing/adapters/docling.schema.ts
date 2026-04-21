import { z } from 'zod';

/**
 * Zod schemas for Docling's async HTTP API wire format.
 * These live inside the Docling adapter and MUST NOT be exported beyond the
 * `parsing/adapters/docling.*` module — every downstream consumer operates on
 * the engine-agnostic {@link ParsedDocument} schema instead.
 */

export const doclingSubmitResponseSchema = z.object({
  task_id: z.string().min(1),
  task_status: z.string().min(1),
});
export type DoclingSubmitResponse = z.infer<typeof doclingSubmitResponseSchema>;

export const doclingStatusResponseSchema = z.object({
  task_id: z.string().min(1),
  task_status: z.string().min(1),
  task_position: z.number().int().nullable().optional(),
  task_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z.array(z.string()).optional(),
});
export type DoclingStatusResponse = z.infer<typeof doclingStatusResponseSchema>;

/**
 * Docling returns `null` (not an omitted key) for any format that was not
 * requested via `to_formats`. Every textual field is therefore modeled as
 * `string | null | undefined` and normalized to `''` downstream — the adapter
 * never hands a nullish content field to the rest of the system.
 */
const nullableStringToEmpty = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? '');

export const doclingConvertResponseSchema = z.object({
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
  errors: z.array(z.string()).optional().default([]),
});
export type DoclingConvertResponse = z.infer<typeof doclingConvertResponseSchema>;

/**
 * Canonical internal task-status enum. The adapter MUST map every Docling wire
 * status into one of these values before the rest of the system sees it.
 */
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

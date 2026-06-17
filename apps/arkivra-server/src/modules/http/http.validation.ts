import type { z } from 'zod';
import type { ApiErrorResponseOptions } from './http.responses.js';

export type ValidationErrorConfig = Pick<ApiErrorResponseOptions, 'code' | 'message'>;

type ValidationParseResult<T> = { ok: true; data: T } | { ok: false; error: ValidationErrorConfig };

export function validateRequestInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  fieldErrors: Record<string, ValidationErrorConfig>,
  fallbackError: ValidationErrorConfig,
): ValidationParseResult<z.output<TSchema>> {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const fieldName = parsed.error.issues[0]?.path[0];
  const configuredError = typeof fieldName === 'string' ? fieldErrors[fieldName] : undefined;

  return {
    ok: false,
    error: configuredError ?? fallbackError,
  };
}

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ServerContext } from '../server/server.types.js';

export type ApiErrorCode = `${string}.${string}`;

export type ApiErrorResponseOptions = {
  code: ApiErrorCode;
  message: string;
  status: ContentfulStatusCode;
};

export function apiErrorResponse(
  context: Context<ServerContext>,
  { code, message, status }: ApiErrorResponseOptions,
) {
  return context.json({ error: { code, message } }, status);
}

export function unauthorizedResponse(context: Context<ServerContext>) {
  return apiErrorResponse(context, {
    code: 'auth.unauthorized',
    message: 'Unauthorized',
    status: 401,
  });
}

export function forbiddenResponse(
  context: Context<ServerContext>,
  {
    code = 'vault.forbidden',
    message = 'Forbidden',
  }: Partial<Pick<ApiErrorResponseOptions, 'code' | 'message'>> = {},
) {
  return apiErrorResponse(context, {
    code,
    message,
    status: 403,
  });
}

export function validationErrorResponse(
  context: Context<ServerContext>,
  { code, message }: Pick<ApiErrorResponseOptions, 'code' | 'message'>,
) {
  return apiErrorResponse(context, {
    code,
    message,
    status: 400,
  });
}

export function notFoundResponse(
  context: Context<ServerContext>,
  { code, message }: Pick<ApiErrorResponseOptions, 'code' | 'message'>,
) {
  return apiErrorResponse(context, {
    code,
    message,
    status: 404,
  });
}

export function operationalErrorResponse(
  context: Context<ServerContext>,
  { code, message, status }: ApiErrorResponseOptions,
) {
  return apiErrorResponse(context, {
    code,
    message,
    status,
  });
}

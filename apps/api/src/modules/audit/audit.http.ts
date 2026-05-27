import type { Context } from 'hono';
import type { ServerContext } from '../server/server.types.js';
import type { AuditActor, AuditRequestContext } from './audit.types.js';

export function getAuditActorFromContext(context: Context<ServerContext>): AuditActor {
  const user = context.get('user');
  const userId = context.get('userId');
  const displayName = user?.name?.trim() || user?.email?.trim() || null;

  return {
    id: userId,
    type: userId === null ? 'unknown' : 'user',
    displayName,
  };
}

export function getAuditRequestContext(context: Context<ServerContext>): AuditRequestContext {
  const forwardedFor = context.req.header('x-forwarded-for');
  const ipAddress = context.req.header('cf-connecting-ip')
    ?? context.req.header('x-real-ip')
    ?? forwardedFor?.split(',')[0]?.trim()
    ?? null;

  return {
    ipAddress,
    userAgent: context.req.header('user-agent') ?? null,
    requestId: context.req.header('x-request-id') ?? context.req.header('x-correlation-id') ?? null,
  };
}

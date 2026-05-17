import { createMiddleware } from 'hono/factory';

export function requireRoot() {
  return createMiddleware(async (context, next) => {
    if (!context.get('isRoot') && !context.get('isGlobalAdmin')) {
      return context.json(
        {
          error: {
            code: 'authorization.root_required',
            message: 'Root access required',
          },
        },
        403,
      );
    }

    await next();
  });
}

/** @deprecated Use requireRoot. Kept until admin routes are fully renamed in Phase 2. */
export function requireGlobalAdmin() {
  return requireRoot();
}

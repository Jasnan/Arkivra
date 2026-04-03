import { createMiddleware } from 'hono/factory';

export function requireGlobalAdmin() {
  return createMiddleware(async (context, next) => {
    if (!context.get('isGlobalAdmin')) {
      return context.json(
        {
          error: {
            code: 'authorization.global_admin_required',
            message: 'Global admin access required',
          },
        },
        403,
      );
    }

    await next();
  });
}

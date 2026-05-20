import { createMiddleware } from 'hono/factory';

export function requireAdmin() {
  return createMiddleware(async (context, next) => {
    if (!context.get('isAdmin')) {
      return context.json(
        {
          error: {
            code: 'authorization.admin_required',
            message: 'Admin access required',
          },
        },
        403,
      );
    }

    await next();
  });
}

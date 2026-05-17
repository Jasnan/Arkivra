import { createMiddleware } from 'hono/factory';

export function requireRoot() {
  return createMiddleware(async (context, next) => {
    if (!context.get('isRoot')) {
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

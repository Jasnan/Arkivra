import { createMiddleware } from 'hono/factory';

export function requireAuthentication() {
  return createMiddleware(async (context, next) => {
    if (context.get('userDisabled')) {
      return context.json(
        {
          error: {
            code: 'auth.account_disabled',
            message: 'Account disabled',
          },
        },
        403,
      );
    }

    const userId = context.get('userId');
    const session = context.get('session');

    if (userId === null || session === null) {
      return context.json(
        {
          error: {
            code: 'auth.unauthorized',
            message: 'Unauthorized',
          },
        },
        401,
      );
    }

    await next();
  });
}

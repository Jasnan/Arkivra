import type { Hono } from 'hono';
import type { AuthorizationServices } from '../../authorization/authorization.services.js';
import type { ServerContext } from '../../server/server.types.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireAdmin } from '../../authorization/authorization.middleware.js';
import { isSystemCapability } from '../../authorization/authorization.types.js';

function parseDisabled(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

export function registerAdminUserRoutes({
  app,
  authorizationServices,
}: {
  app: Hono<ServerContext>;
  authorizationServices: AuthorizationServices;
}) {
  app.use('/api/admin/users', requireAuthentication(), requireAdmin());
  app.use('/api/admin/users/*', requireAuthentication(), requireAdmin());

  app.get('/api/admin/users', async (context) => {
    const users = await authorizationServices.listUsers();
    return context.json({ users });
  });

  app.patch('/api/admin/users/:userId', async (context) => {
    const userId = context.req.param('userId');
    const body = await context.req.json().catch(() => null);
    const disabled = parseDisabled(body?.disabled);

    if (disabled === null) {
      return context.json(
        {
          error: {
            code: 'admin.invalid_user_payload',
            message: 'disabled must be a boolean',
          },
        },
        400,
      );
    }

    try {
      const user = await authorizationServices.setUserDisabled({ userId, disabled });

      if (user === null) {
        return context.json(
          {
            error: {
              code: 'admin.user_not_found',
              message: 'User not found',
            },
          },
          404,
        );
      }

      return context.json({ user });
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.last_admin') {
        return context.json(
          {
            error: {
              code: 'authorization.last_admin',
              message: 'At least one active admin is required',
            },
          },
          409,
        );
      }

      throw error;
    }
  });

  app.post('/api/admin/users/:userId/admin', async (context) => {
    const userId = context.req.param('userId');
    const user = await authorizationServices.grantAdmin({ userId });

    if (user === null) {
      return context.json(
        {
          error: {
            code: 'admin.user_not_found',
            message: 'User not found',
          },
        },
        404,
      );
    }

    return context.json({ user });
  });

  app.post('/api/admin/users/:userId/system-capabilities/:capability', async (context) => {
    const userId = context.req.param('userId');
    const capability = context.req.param('capability');

    if (!isSystemCapability(capability)) {
      return context.json(
        {
          error: {
            code: 'authorization.invalid_system_capability',
            message: 'Invalid system capability',
          },
        },
        400,
      );
    }

    const user = await authorizationServices.grantSystemCapability({
      userId,
      capability,
      createdBy: context.get('userId'),
    });

    if (user === null) {
      return context.json(
        {
          error: {
            code: 'admin.user_not_found',
            message: 'User not found',
          },
        },
        404,
      );
    }

    return context.json({ user });
  });

  app.delete('/api/admin/users/:userId/admin', async (context) => {
    const userId = context.req.param('userId');

    try {
      const user = await authorizationServices.revokeAdmin({ userId });

      if (user === null) {
        return context.json(
          {
            error: {
              code: 'admin.user_not_found',
              message: 'User not found',
            },
          },
          404,
        );
      }

      return context.json({ user });
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.last_admin') {
        return context.json(
          {
            error: {
              code: 'authorization.last_admin',
              message: 'At least one active admin is required',
            },
          },
          409,
        );
      }

      throw error;
    }
  });

  app.delete('/api/admin/users/:userId/system-capabilities/:capability', async (context) => {
    const userId = context.req.param('userId');
    const capability = context.req.param('capability');

    if (!isSystemCapability(capability)) {
      return context.json(
        {
          error: {
            code: 'authorization.invalid_system_capability',
            message: 'Invalid system capability',
          },
        },
        400,
      );
    }

    const user = await authorizationServices.revokeSystemCapability({ userId, capability });

    if (user === null) {
      return context.json(
        {
          error: {
            code: 'admin.user_not_found',
            message: 'User not found',
          },
        },
        404,
      );
    }

    return context.json({ user });
  });
}

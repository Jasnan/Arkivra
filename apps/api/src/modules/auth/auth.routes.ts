import type { Hono } from 'hono';
import type { AuthorizationServices } from '../authorization/authorization.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { Auth } from './auth.services.js';

export function registerAuthRoutes({
  app,
  auth,
  authorizationServices,
}: {
  app: Hono<ServerContext>;
  auth: Auth;
  authorizationServices: AuthorizationServices;
}) {
  // Better Auth handles all /api/auth/* routes (signup, login, logout, session, 2FA, etc.)
  app.on(['POST', 'GET'], '/api/auth/**', async (context) => auth.handler(context.req.raw));

  // Session extraction middleware — runs on ALL routes after auth routes
  // Extracts user/session from cookie and sets it on context
  app.use('*', async (context, next) => {
    const sessionData = await auth.api.getSession({ headers: context.req.raw.headers });

    if (sessionData) {
      const { user, session } = sessionData;
      await authorizationServices.ensureBootstrapGlobalAdmin({ userId: user.id });
      const authorizationState = await authorizationServices.getUserAuthorizationState({
        userId: user.id,
      });

      if (authorizationState?.disabledAt !== null) {
        context.set('userDisabled', true);
      } else {
        context.set('userId', user.id);
        context.set('session', session);
        context.set('isGlobalAdmin', authorizationState?.isGlobalAdmin ?? false);
        context.set('canCreateVault', authorizationState?.canCreateVault ?? false);
      }
    }

    return next();
  });
}

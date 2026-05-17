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
  const handleAuthRequest = async (context: Parameters<typeof app.on>[2] extends (...args: infer A) => any ? A[0] : never) => {
    return auth.handler(context.req.raw);
  };

  app.on(['POST', 'GET'], '/api/auth', handleAuthRequest);
  app.on(['POST', 'GET'], '/api/auth/*', handleAuthRequest);

  // Session extraction middleware — runs on ALL routes after auth routes
  // Extracts user/session from cookie and sets it on context
  app.use('*', async (context, next) => {
    const sessionData = await auth.api.getSession({ headers: context.req.raw.headers });

    if (sessionData) {
      const { user, session } = sessionData;
      await authorizationServices.ensureBootstrapRoot({ userId: user.id });
      const authorizationState = await authorizationServices.getUserAuthorizationState({
        userId: user.id,
      });

      if (authorizationState?.disabledAt !== null) {
        context.set('userDisabled', true);
      } else {
        context.set('userId', user.id);
        context.set('user', user);
        context.set('session', session);
        context.set('systemRole', authorizationState?.systemRole ?? 'member');
        context.set('systemCapabilities', authorizationState?.systemCapabilities ?? []);
        context.set('isRoot', authorizationState?.isRoot ?? false);
        context.set('isGlobalAdmin', authorizationState?.isGlobalAdmin ?? false);
        context.set('canCreateVault', authorizationState?.canCreateVault ?? false);
      }
    }

    return next();
  });
}

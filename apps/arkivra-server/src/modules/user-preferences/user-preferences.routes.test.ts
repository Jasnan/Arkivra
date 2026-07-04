import type { ServerContext } from '../server/server.types.js';
import type { UserPreferencesServices } from './user-preferences.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerUserPreferencesRoutes } from './user-preferences.routes.js';

function createPreferences() {
  return {
    appearancePreferences: {
      themeMode: 'system',
      selectedTheme: 'default',
      selectedTweakcnTheme: '',
      selectedRadius: '0.5rem',
      brandColors: {},
      sidebar: {
        variant: 'inset',
        collapsible: 'offcanvas',
        side: 'left',
      },
    },
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  } as const;
}

function createTestApp({ isAuthenticated = true }: { isAuthenticated?: boolean } = {}) {
  const app = new Hono<ServerContext>();
  const services = {
    getPreferences: vi.fn(async () => createPreferences()),
    updatePreferences: vi.fn(async ({ preferences }) => ({
      ...createPreferences(),
      ...preferences,
      updatedAt: '2026-05-15T01:00:00.000Z',
    })),
  } satisfies UserPreferencesServices;

  app.use('*', async (context, next) => {
    context.set('userId', isAuthenticated ? 'usr_test' : null);
    context.set(
      'session',
      isAuthenticated
        ? {
            id: 'ses_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: 'usr_test',
            expiresAt: new Date(Date.now() + 3600_000),
            token: 'tok_test',
          }
        : null,
    );
    context.set('userDisabled', false);
    context.set('canCreateVault', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    await next();
  });

  registerUserPreferencesRoutes({ app, services });

  return { app, services };
}

describe('user preferences routes', () => {
  test('returns 401 for unauthenticated requests', async () => {
    const { app } = createTestApp({ isAuthenticated: false });

    const response = await app.request('/api/me/preferences');

    expect(response.status).toBe(401);
  });

  test('returns current user preferences', async () => {
    const { app, services } = createTestApp();

    const response = await app.request('/api/me/preferences');

    expect(response.status).toBe(200);
    expect(services.getPreferences).toHaveBeenCalledWith({ userId: 'usr_test' });
    await expect(response.json()).resolves.toEqual({ preferences: createPreferences() });
  });

  test('updates validated appearance preferences', async () => {
    const { app, services } = createTestApp();

    const response = await app.request('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appearancePreferences: {
          themeMode: 'dark',
          selectedTheme: 'default',
          selectedTweakcnTheme: '',
          selectedRadius: '0.5rem',
          brandColors: { '--primary': '#2563eb' },
          sidebar: {
            variant: 'inset',
            collapsible: 'offcanvas',
            side: 'left',
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.updatePreferences).toHaveBeenCalledWith({
      userId: 'usr_test',
      preferences: {
        appearancePreferences: {
          themeMode: 'dark',
          selectedTheme: 'default',
          selectedTweakcnTheme: '',
          selectedRadius: '0.5rem',
          brandColors: { '--primary': '#2563eb' },
          sidebar: {
            variant: 'inset',
            collapsible: 'offcanvas',
            side: 'left',
          },
        },
      },
    });
  });

  test('rejects invalid preference values', async () => {
    const { app, services } = createTestApp();

    const response = await app.request('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appearancePreferences: { themeMode: 'brown' } }),
    });

    expect(response.status).toBe(400);
    expect(services.updatePreferences).not.toHaveBeenCalled();
  });

  test('rejects legacy top-level theme mode updates', async () => {
    const { app, services } = createTestApp();

    const response = await app.request('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ themeMode: 'dark' }),
    });

    expect(response.status).toBe(400);
    expect(services.updatePreferences).not.toHaveBeenCalled();
  });

  test('rejects invalid appearance preference payloads', async () => {
    const { app, services } = createTestApp();

    const response = await app.request('/api/me/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appearancePreferences: {
          themeMode: 'sepia',
          selectedTheme: 'default',
          selectedTweakcnTheme: '',
          selectedRadius: '0.5rem',
          brandColors: {},
          sidebar: {
            variant: 'inset',
            collapsible: 'offcanvas',
            side: 'left',
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(services.updatePreferences).not.toHaveBeenCalled();
  });
});

import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

export function createServer({ config, db }: { config: Config; db: Database }) {
  const app = new Hono({ strict: true });

  app.use(cors({
    origin: config.server.corsOrigins,
    credentials: true,
  }));

  app.use(secureHeaders());

  // Health check endpoint
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      version: config.version,
      timestamp: new Date().toISOString(),
    });
  });

  // Root redirect
  app.get('/', (c) => {
    return c.json({
      name: 'Arkivra',
      version: config.version,
      docs: '/api/health',
    });
  });

  return { app };
}

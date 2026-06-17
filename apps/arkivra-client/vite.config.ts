import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const browserMcpShim = fileURLToPath(new URL('./src/lib/ai-sdk-mcp-browser-shim.ts', import.meta.url));

function readPort(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback;
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, repoRoot, ''),
    ...process.env,
  };
  const apiPort = readPort(env.ARKIVRA_PORT, 1221);
  const webPort = readPort(env.ARKIVRA_WEB_PORT, 5173);
  const apiTarget =
    env.VITE_ARKIVRA_API_BASE_URL ?? env.ARKIVRA_SERVER_BASE_URL ?? `http://localhost:${apiPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: [
        { find: '@ai-sdk/mcp/mcp-stdio', replacement: browserMcpShim },
        { find: '@ai-sdk/mcp', replacement: browserMcpShim },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2022',
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      env: {
        TZ: 'UTC',
      },
    },
  };
});

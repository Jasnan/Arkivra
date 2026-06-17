import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadApiEnvFiles } from './env-loader.js';

describe('loadApiEnvFiles', () => {
  it('loads root and API env files without overriding existing environment values', () => {
    const root = mkdtempSync(join(tmpdir(), 'arkivra-env-'));
    const apiDir = join(root, 'apps', 'api');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"name":"@arkivra/root"}');
    writeFileSync(join(apiDir, 'package.json'), '{"name":"@arkivra/api"}');
    writeFileSync(join(root, '.env'), [
      'GEMINI_API_KEY=root-key',
      'ARKIVRA_PORT=1221',
      'EXPORTED_ROOT=from-root',
    ].join('\n'));
    writeFileSync(join(apiDir, '.env'), [
      'GEMINI_API_KEY=api-key',
      'export API_ONLY="from-api"',
    ].join('\n'));

    const env: NodeJS.ProcessEnv = {
      ARKIVRA_PORT: '1321',
    };

    try {
      loadApiEnvFiles({ cwd: apiDir, env });

      expect(env.GEMINI_API_KEY).toBe('root-key');
      expect(env.ARKIVRA_PORT).toBe('1321');
      expect(env.EXPORTED_ROOT).toBe('from-root');
      expect(env.API_ONLY).toBe('from-api');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

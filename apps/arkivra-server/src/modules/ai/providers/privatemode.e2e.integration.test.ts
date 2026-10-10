import type { Config } from '../../config/config.js';
import type { Database } from '../../database/database.js';
import { sql } from 'drizzle-orm';
import { describe, expect, test, vi } from 'vitest';
import { setupDatabase } from '../../database/database.js';
import { createAdminAiServices } from '../../admin/ai/ai.services.js';

// Use an explicitly selected test database. Every write is rolled back.
describe.skipIf(!process.env.ARKIVRA_TEST_DATABASE_URL)('privatemode database integration', () => {
  test('persists selections and creates a provider-specific embedding index with existing schema', async () => {
    vi.stubEnv('ARKIVRA_PRIVATEMODE_PROXY_URL', 'http://127.0.0.1:8080/v1');
    vi.stubEnv('PRIVATEMODE_API_KEY', 'integration-test-key');
    const config = {
      database: { url: process.env.ARKIVRA_TEST_DATABASE_URL! },
      ollama: { configured: false, host: '', logRequests: false },
    } as Config;
    const { db, pool } = setupDatabase({ config });
    const rollback = new Error('rollback successful test');
    try {
      await expect(
        db.transaction(async (tx) => {
          const enqueueOrchestrateIndex = vi.fn();
          const services = createAdminAiServices({
            db: tx as unknown as Database,
            config,
            embeddingIndexQueue: { enqueueOrchestrateIndex } as any,
            fetchImpl: async () =>
              Response.json({ data: [{ index: 0, embedding: Array.from<number>({ length: 1024 }).fill(0.1) }] }),
          });
          await services.updateSettings({
            aiFeaturesEnabled: true,
            chat: {
              provider: 'privatemode',
              baseUrl: 'http://127.0.0.1:8080/v1',
              apiKeySecretRef: null,
              model: 'glm-latest',
              allowedModels: ['privatemode:glm-latest', 'gemini:gemini-test'],
            },
            translation: {
              provider: 'privatemode',
              baseUrl: 'http://127.0.0.1:8080/v1',
              apiKeySecretRef: null,
              model: 'glm-flash-latest',
            },
            embedding: {
              provider: 'privatemode',
              baseUrl: 'http://127.0.0.1:8080/v1',
              apiKeySecretRef: null,
              model: 'qwen3-embedding-4b',
              dimensions: null,
            },
            ollamaHost: '',
            model: '',
          });
          const settings = await services.getSettings();
          expect(settings.chat.provider).toBe('privatemode');
          expect(settings.chat.allowedModels).toContain('gemini:gemini-test');
          expect(settings.translation.provider).toBe('privatemode');
          expect(settings.embedding).toMatchObject({
            provider: 'privatemode',
            dimensions: 1024,
            apiKeySecretRef: 'PRIVATEMODE_API_KEY',
          });
          // Configuring the same model reuses an existing index on an already configured instance.
          const existingIndexes = await tx.execute<{ id: string }>(
            sql`SELECT id FROM embedding_indexes WHERE provider = 'privatemode' AND model = 'qwen3-embedding-4b' AND dimensions = 1024 AND status IN ('active', 'ready', 'building') ORDER BY is_active DESC, created_at DESC`,
          );
          const indexId = enqueueOrchestrateIndex.mock.calls[0]?.[0].embeddingIndexId ?? existingIndexes.rows[0]?.id;
          expect(indexId).toBeTruthy();
          const result = await tx.execute(
            sql`SELECT provider, model, dimensions FROM embedding_indexes WHERE id = ${indexId}`,
          );
          expect(result.rows).toEqual([
            { provider: 'privatemode', model: 'qwen3-embedding-4b', dimensions: 1024 },
          ]);
          const stored = await tx.execute(
            sql`SELECT chat_api_key_secret_ref, translation_api_key_secret_ref, embedding_api_key_secret_ref FROM instance_settings WHERE id = 'instance_ai_settings'`,
          );
          expect(JSON.stringify(stored.rows)).not.toContain('integration-test-key');
          expect(stored.rows[0]).toEqual({
            chat_api_key_secret_ref: 'PRIVATEMODE_API_KEY',
            translation_api_key_secret_ref: 'PRIVATEMODE_API_KEY',
            embedding_api_key_secret_ref: 'PRIVATEMODE_API_KEY',
          });
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    } finally {
      await pool.end();
      vi.unstubAllEnvs();
    }
  });
});

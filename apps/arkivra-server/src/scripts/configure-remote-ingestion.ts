import { sql } from 'drizzle-orm';
import { loadApiEnvFiles } from '../modules/config/env-loader.js';
import { parseConfig } from '../modules/config/config.js';
import { setupDatabase } from '../modules/database/database.js';
import { createAdminAiServices } from '../modules/admin/ai/ai.services.js';
import { createEmbeddingIndexQueue } from '../modules/ai/indexing/index.js';
import { privatemodeProxyBaseUrl } from '../modules/ai/providers/privatemode.provider.js';

loadApiEnvFiles();
const { config } = parseConfig({ env: process.env });
if (config.ingestion.engine !== 'privatemode')
  throw new Error(
    'Select ARKIVRA_INGESTION_ENGINE=privatemode before configuring remote ingestion.',
  );
const { db, pool } = setupDatabase({ config });
try {
  const embeddingIndexQueue = createEmbeddingIndexQueue({ db, appInstance: config.app.instance });
  const services = createAdminAiServices({ db, config, embeddingIndexQueue });
  const previous = await services.getSettings();
  const baseUrl = privatemodeProxyBaseUrl();
  const settings = await services.updateSettings({
    ...previous,
    aiFeaturesEnabled: true,
    chat: {
      provider: 'privatemode',
      baseUrl,
      apiKeySecretRef: 'PRIVATEMODE_API_KEY',
      model: 'gpt-oss-120b',
      allowedModels: [
        'privatemode:glm-5.3-flash',
        'privatemode:glm-5.3',
        'privatemode:gpt-oss-120b',
      ],
    },
    translation: {
      provider: 'privatemode',
      baseUrl,
      apiKeySecretRef: 'PRIVATEMODE_API_KEY',
      model: 'gpt-oss-120b',
    },
    embedding: {
      provider: 'privatemode',
      baseUrl,
      apiKeySecretRef: 'PRIVATEMODE_API_KEY',
      model: 'qwen3-embedding-4b',
      dimensions: 1024,
    },
    ollamaHost: '',
    model: '',
  });
  // This explicit remote setup command retires local-provider indexes without deleting documents.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`UPDATE embedding_indexes SET status = 'retired', is_active = false, updated_at = now() WHERE provider <> 'privatemode' AND status IN ('active', 'ready', 'building')`,
    );
    await tx.execute(
      sql`UPDATE ai_provider_configs SET is_enabled = false, updated_at = now() WHERE capability = 'embedding' AND provider <> 'privatemode'`,
    );
  });
  const indexes = await db.execute<{ id: string }>(
    sql`SELECT id FROM embedding_indexes WHERE provider = 'privatemode' AND model = 'qwen3-embedding-4b' AND status IN ('building', 'active')`,
  );
  for (const index of indexes.rows)
    await embeddingIndexQueue.enqueueOrchestrateIndex({ embeddingIndexId: index.id });
  console.info(
    JSON.stringify({
      provider: settings.embedding.provider,
      model: settings.embedding.model,
      dimensions: settings.embedding.dimensions,
      chatModel: settings.chat.model,
      indexBuild: 'queued/resumed; run the worker',
    }),
  );
} finally {
  await pool.end();
}

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/modules/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@localhost:5432/arkivra',
  },
});

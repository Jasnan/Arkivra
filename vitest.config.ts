import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    reporters: ['verbose'],
    projects: ['apps/*'],
    env: {
      TZ: 'UTC',
    },
  },
});

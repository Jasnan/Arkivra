import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    reporters: ['verbose'],
    projects: ['apps/*'],
    env: {
      TZ: 'UTC',
    },
  },
});

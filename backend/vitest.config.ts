import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**', 'src/routes/**'],
    },
    env: {
      DATABASE_URL: 'file:/tmp/footy-test-vitest.db',
      ITIPFOOTY_USERNAME: 'testuser',
      ITIPFOOTY_PASSWORD: 'testpass',
      ITIPFOOTY_COMP_ID: '12345',
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000, // 30 seconds for persistent storage tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['node_modules/', 'test/']
    },
    browser: {
      enabled: false, // Enable with --browser flag or test:browser script
      name: 'chromium',
      provider: 'playwright',
      headless: true,
      screenshotOnFailure: false
    }
  }
});

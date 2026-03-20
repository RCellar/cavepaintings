import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.mjs',
  timeout: 15000,
  use: {
    headless: true,
  },
});

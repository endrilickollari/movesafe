import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@movesafe/core/advanced',
        replacement: fileURLToPath(new URL('../core/src/advanced.ts', import.meta.url)),
      },
      {
        find: '@movesafe/core',
        replacement: fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});

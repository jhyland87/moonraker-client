import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      // type-only modules and the re-export barrel have no runtime to cover
      exclude: ['src/types.ts', 'src/events.ts', 'src/index.ts'],
    },
  },
});

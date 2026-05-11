import { defineConfig } from 'tsup';

/**
 * tsup builds the published bundle. tsc is used only for type checking
 * (see `pnpm typecheck`). Source files use extensionless relative imports;
 * tsup (via esbuild) resolves them, and the emitted ESM output has the
 * correct `.js` extensions so it runs unmodified under Node's ESM loader.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'es2024',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});

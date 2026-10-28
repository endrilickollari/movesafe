import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/advanced.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  clean: true,
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/advanced.ts'],
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      // tsup 8 injects baseUrl internally; scope the TS 6 compatibility workaround to declaration bundling.
      ignoreDeprecations: '6.0',
    },
  },
  sourcemap: false,
  clean: true,
});

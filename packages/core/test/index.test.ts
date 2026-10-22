import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import * as advanced from '../src/advanced.js';

describe('@movesafe/core', () => {
  it('exposes the package version', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(core.CORE_VERSION).toBe(manifest.version);
  });

  it('keeps lower-level APIs behind the advanced entry point', () => {
    expect(Object.keys(core).sort()).toEqual([
      'CORE_VERSION',
      'MOVE_PLAN_SCHEMA_VERSION',
      'applyMove',
      'checkImports',
      'planMove',
    ]);
    expect(advanced.buildImportGraph).toBeTypeOf('function');
    expect('buildImportGraph' in core).toBe(false);
  });
});

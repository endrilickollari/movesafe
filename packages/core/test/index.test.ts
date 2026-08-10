import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import * as advanced from '../src/advanced.js';

describe('@movesafe/core', () => {
  it('exposes the package version', () => {
    expect(core.CORE_VERSION).toBe('0.1.0');
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

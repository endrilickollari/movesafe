import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runTsc } from '../src/run-tsc.js';

describe('runTsc', () => {
  it('distinguishes a missing project compiler from a zero-error run', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'movesafe-tsc-'));

    try {
      const result = runTsc(repoDir);
      expect(result.completed).toBe(false);
      expect(result.errorCount).toBe(0);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

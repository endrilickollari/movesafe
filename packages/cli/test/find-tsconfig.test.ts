import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findNearestTsconfig } from '../src/find-tsconfig.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-find-tsconfig-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('findNearestTsconfig', () => {
  it('finds a tsconfig.json in the same directory as the start point', () => {
    writeFileSync(join(tempDir, 'tsconfig.json'), '{}', 'utf8');
    expect(findNearestTsconfig(tempDir)).toBe(join(tempDir, 'tsconfig.json'));
  });

  it('finds a tsconfig.json in a parent directory', () => {
    writeFileSync(join(tempDir, 'tsconfig.json'), '{}', 'utf8');
    const nested = join(tempDir, 'src', 'lib');
    mkdirSync(nested, { recursive: true });
    expect(findNearestTsconfig(nested)).toBe(join(tempDir, 'tsconfig.json'));
  });

  it('returns undefined when no tsconfig.json exists up to the filesystem root', () => {
    const nested = join(tempDir, 'src', 'lib');
    mkdirSync(nested, { recursive: true });
    expect(findNearestTsconfig(nested)).toBeUndefined();
  });
});

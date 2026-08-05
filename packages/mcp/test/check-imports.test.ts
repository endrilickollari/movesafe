import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkImports } from '../src/check-imports.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-mcp-check-imports-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('checkImports', () => {
  it('reports no findings for a clean project', () => {
    const projectDir = useFixture('basic-project');

    const result = checkImports({ path: undefined, cwd: projectDir });

    expect(result).toMatchObject({ ok: true, findings: [], summary: { errorCount: 0, total: 0 } });
  });

  it('reports an unresolved-import finding for a broken project', () => {
    const projectDir = useFixture('broken-project');

    const result = checkImports({ path: undefined, cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(result.summary.errorCount).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === 'unresolved-import')).toBe(true);
  });

  it('defaults path to cwd when omitted', () => {
    const projectDir = useFixture('basic-project');

    const result = checkImports({ path: undefined, cwd: projectDir });

    expect(result.ok).toBe(true);
  });

  it('accepts an explicit relative path argument', () => {
    useFixture('basic-project');

    const result = checkImports({ path: 'basic-project', cwd: tempDir });

    expect(result.ok).toBe(true);
  });

  it('returns an error when no tsconfig.json can be found', () => {
    const result = checkImports({ path: undefined, cwd: tempDir });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('tsconfig.json');
  });
});

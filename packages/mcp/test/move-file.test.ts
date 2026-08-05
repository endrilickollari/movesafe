import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveFile } from '../src/move-file.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-mcp-move-file-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('moveFile', () => {
  it('dry-run: returns a plan with edits and does not modify any file on disk', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const indexPath = join(projectDir, 'src', 'index.ts');
    const beforeIndex = readFileSync(indexPath, 'utf8');

    const result = moveFile({ from, to, dryRun: true, cwd: projectDir });

    expect(result).toMatchObject({ ok: true, applied: false });
    expect(result.edits.length).toBeGreaterThan(0);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(readFileSync(indexPath, 'utf8')).toBe(beforeIndex);
  });

  it('applies a real move: file relocated, importer rewritten', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const indexPath = join(projectDir, 'src', 'index.ts');

    const result = moveFile({ from, to, dryRun: false, cwd: projectDir });

    expect(result).toMatchObject({ ok: true, applied: true });
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
    expect(readFileSync(indexPath, 'utf8')).toContain('./renamed.js');
  });

  it('refuses without touching disk when the plan has error diagnostics', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'index.ts');

    const result = moveFile({ from, to, dryRun: false, cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(existsSync(from)).toBe(true);
  });

  it('returns an error when the source file does not exist', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'does-not-exist.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const result = moveFile({ from, to, dryRun: false, cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot find file');
  });

  it('returns an error when no tsconfig.json can be found', () => {
    const bareDir = join(tempDir, 'bare');
    writeFileSync(join(tempDir, 'lonely.ts'), 'export const x = 1;\n', 'utf8');
    const from = join(tempDir, 'lonely.ts');
    const to = join(bareDir, 'lonely.ts');

    const result = moveFile({ from, to, dryRun: false, cwd: tempDir });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('tsconfig.json');
  });

  it('returns an error when the resolved source and destination are the same path', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');

    const result = moveFile({ from, to: from, dryRun: false, cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('same path');
  });
});

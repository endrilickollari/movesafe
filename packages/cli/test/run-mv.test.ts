import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMv } from '../src/run-mv.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-cli-run-mv-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('runMv', () => {
  it('dry-run: prints a diff and does not modify any file on disk', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const indexPath = join(projectDir, 'src', 'index.ts');
    const beforeIndex = readFileSync(indexPath, 'utf8');
    const beforeUtils = readFileSync(from, 'utf8');

    const result = runMv({ from, to, dryRun: true, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain("./renamed.js");
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(readFileSync(indexPath, 'utf8')).toBe(beforeIndex);
    expect(readFileSync(from, 'utf8')).toBe(beforeUtils);
  });

  it('applies a real move: file relocated, importer rewritten, success line printed', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const indexPath = join(projectDir, 'src', 'index.ts');

    const result = runMv({ from, to, dryRun: false, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain('✔ Moved');
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
    expect(readFileSync(indexPath, 'utf8')).toContain("./renamed.js");
  });

  it('refuses with a friendly error, touching nothing, when the plan has error diagnostics', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'index.ts');

    const result = runMv({ from, to, dryRun: false, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('✖');
    expect(existsSync(from)).toBe(true);
  });

  it('refuses with a friendly error when the source file does not exist', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'does-not-exist.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const result = runMv({ from, to, dryRun: false, color: false, cwd: projectDir });

    expect(result).toEqual({ exitCode: 1, lines: [expect.stringContaining('Cannot find file')] });
  });

  it('refuses with a friendly error when no tsconfig.json can be found', () => {
    const bareDir = join(tempDir, 'bare');
    writeFileSync(join(tempDir, 'lonely.ts'), 'export const x = 1;\n', 'utf8');
    const from = join(tempDir, 'lonely.ts');
    const to = join(bareDir, 'lonely.ts');

    const result = runMv({ from, to, dryRun: false, color: false, cwd: tempDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('tsconfig.json');
  });

  it('refuses with a friendly error when the resolved source and destination are the same path', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');

    const result = runMv({ from, to: from, dryRun: false, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('same path');
  });
});

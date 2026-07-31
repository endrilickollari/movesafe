import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheck } from '../src/run-check.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-cli-run-check-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('runCheck', () => {
  it('exits 0 with no findings for a clean project', () => {
    const projectDir = useFixture('basic-project');

    const result = runCheck({ path: undefined, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('No issues found');
  });

  it('exits 1 and reports the problem for a project with an unresolved import', () => {
    const projectDir = useFixture('broken-project');

    const result = runCheck({ path: undefined, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('✖');
  });

  it('defaults path to cwd when omitted', () => {
    const projectDir = useFixture('basic-project');

    const result = runCheck({ path: undefined, color: false, cwd: projectDir });

    expect(result.exitCode).toBe(0);
  });

  it('accepts an explicit relative path argument', () => {
    useFixture('basic-project');

    const result = runCheck({ path: 'basic-project', color: false, cwd: tempDir });

    expect(result.exitCode).toBe(0);
  });

  it('refuses with a friendly error when no tsconfig.json can be found', () => {
    const result = runCheck({ path: undefined, color: false, cwd: tempDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('tsconfig.json');
  });
});

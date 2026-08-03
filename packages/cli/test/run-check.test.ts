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

    const result = runCheck({ path: undefined, format: 'tty', color: false, cwd: projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).toContain('No issues found');
  });

  it('exits 1 and reports the problem for a project with an unresolved import', () => {
    const projectDir = useFixture('broken-project');

    const result = runCheck({ path: undefined, format: 'tty', color: false, cwd: projectDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('✖');
  });

  it('defaults path to cwd when omitted', () => {
    const projectDir = useFixture('basic-project');

    const result = runCheck({ path: undefined, format: 'tty', color: false, cwd: projectDir });

    expect(result.exitCode).toBe(0);
  });

  it('accepts an explicit relative path argument', () => {
    useFixture('basic-project');

    const result = runCheck({ path: 'basic-project', format: 'tty', color: false, cwd: tempDir });

    expect(result.exitCode).toBe(0);
  });

  it('refuses with a friendly error when no tsconfig.json can be found', () => {
    const result = runCheck({ path: undefined, format: 'tty', color: false, cwd: tempDir });

    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('tsconfig.json');
  });

  describe('--json', () => {
    it('reports a zeroed summary in valid JSON for a clean project', () => {
      const projectDir = useFixture('basic-project');

      const result = runCheck({ path: undefined, format: 'json', color: false, cwd: projectDir });
      const parsed = JSON.parse(result.lines.join('\n'));

      expect(result.exitCode).toBe(0);
      expect(parsed.summary).toEqual({ errorCount: 0, warningCount: 0, total: 0 });
      expect(parsed.findings).toEqual([]);
    });

    it('reports findings and a non-zero errorCount for a broken project', () => {
      const projectDir = useFixture('broken-project');

      const result = runCheck({ path: undefined, format: 'json', color: false, cwd: projectDir });
      const parsed = JSON.parse(result.lines.join('\n'));

      expect(result.exitCode).toBe(1);
      expect(parsed.summary.errorCount).toBeGreaterThan(0);
      expect(parsed.findings.length).toBe(parsed.summary.total);
    });
  });

  describe('--md', () => {
    it('reports no issues found for a clean project', () => {
      const projectDir = useFixture('basic-project');

      const result = runCheck({ path: undefined, format: 'md', color: false, cwd: projectDir });

      expect(result.exitCode).toBe(0);
      expect(result.lines.join('\n')).toContain('### movesafe check');
      expect(result.lines.join('\n')).toContain('No issues found');
    });

    it('lists findings as a bulleted section for a broken project', () => {
      const projectDir = useFixture('broken-project');

      const result = runCheck({ path: undefined, format: 'md', color: false, cwd: projectDir });

      expect(result.exitCode).toBe(1);
      expect(result.lines.join('\n')).toContain('**Errors**');
      expect(result.lines.join('\n')).toMatch(/^- /m);
    });
  });
});

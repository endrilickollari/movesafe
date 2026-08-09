import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planMoveTool } from '../src/plan-move.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-mcp-plan-move-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('planMoveTool', () => {
  it('returns a ready plan with edits, a rendered diff, and a planHash — and never touches disk', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const indexPath = join(projectDir, 'src', 'index.ts');
    const beforeIndex = readFileSync(indexPath, 'utf8');

    const result = planMoveTool({ from, to, cwd: projectDir });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.operation).toBe('file');
    expect(result.edits.length).toBeGreaterThan(0);
    expect(result.diff.files.length).toBeGreaterThan(0);
    expect(result.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(readFileSync(indexPath, 'utf8')).toBe(beforeIndex);
  });

  it('returns a blocked plan with an empty diff when the source does not exist', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'does-not-exist.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const result = planMoveTool({ from, to, cwd: projectDir });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(result.diff).toEqual({ files: [] });
  });

  it('produces the same planHash as a second call against the same, unchanged project', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const first = planMoveTool({ from, to, cwd: projectDir });
    const second = planMoveTool({ from, to, cwd: projectDir });

    expect(first.planHash).toBe(second.planHash);
  });
});

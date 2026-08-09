import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMoveTool } from '../src/apply-move.js';
import { planMoveTool } from '../src/plan-move.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-mcp-apply-move-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('applyMoveTool', () => {
  it('applies for real when the supplied planHash matches a fresh recomputation', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = planMoveTool({ from, to, cwd: projectDir });
    const result = applyMoveTool({ from, to, planHash: plan.planHash, cwd: projectDir });

    expect(result).toMatchObject({ ok: true, status: 'applied' });
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
    expect(readFileSync(join(projectDir, 'src', 'index.ts'), 'utf8')).toContain('./renamed.js');
  });

  it('refuses with hash-mismatch, touching nothing, when the supplied planHash is stale', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const result = applyMoveTool({ from, to, planHash: 'not-a-real-hash', cwd: projectDir });

    expect(result).toMatchObject({ ok: false, status: 'hash-mismatch', planHash: 'not-a-real-hash' });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'plan-hash-mismatch' }),
    );
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('reports hash-mismatch when a reviewed ready plan recomputes as blocked', () => {
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = planMoveTool({ from, to, cwd: projectDir });

    writeFileSync(to, 'export const occupied = true;\n', 'utf8');

    const result = applyMoveTool({ from, to, planHash: plan.planHash, cwd: projectDir });

    expect(result).toMatchObject({ ok: false, status: 'hash-mismatch', planHash: plan.planHash });
    expect(existsSync(from)).toBe(true);
    expect(readFileSync(to, 'utf8')).toBe('export const occupied = true;\n');
  });

  it('refuses when the project changed on disk since planning, even with the right hash', () => {
    // apply_move always recomputes the plan fresh rather than replaying the
    // caller's copy, so content drift that changes what the edits would be
    // surfaces here as a hash mismatch (the recomputed plan legitimately
    // hashes differently) — not core's separate stale-content precondition
    // check, which only fires for drift a full recompute wouldn't itself
    // already capture in a different hash.
    const projectDir = useFixture('basic-project');
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = planMoveTool({ from, to, cwd: projectDir });

    const indexPath = join(projectDir, 'src', 'index.ts');
    writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace("'./utils.js'", "'./utils-changed.js'"), 'utf8');

    const result = applyMoveTool({ from, to, planHash: plan.planHash, cwd: projectDir });

    expect(result.status).toBe('hash-mismatch');
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('plans and applies a directory move end-to-end', () => {
    const projectDir = join(tempDir, 'directory-project');
    mkdirSync(join(projectDir, 'src', 'feature'), { recursive: true });
    writeFileSync(
      join(projectDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' }, include: ['src'] }),
      'utf8',
    );
    writeFileSync(join(projectDir, 'src', 'feature', 'a.ts'), 'export const a = 1;\n', 'utf8');
    writeFileSync(
      join(projectDir, 'src', 'external.ts'),
      "import { a } from './feature/a.js';\nexport { a };\n",
      'utf8',
    );

    const from = join(projectDir, 'src', 'feature');
    const to = join(projectDir, 'src', 'relocated', 'feature');

    const plan = planMoveTool({ from, to, cwd: projectDir });
    expect(plan.operation).toBe('directory');
    expect(plan.status).toBe('ready');

    const result = applyMoveTool({ from, to, planHash: plan.planHash, cwd: projectDir });

    expect(result).toMatchObject({ ok: true, status: 'applied' });
    expect(existsSync(join(to, 'a.ts'))).toBe(true);
    expect(readFileSync(join(projectDir, 'src', 'external.ts'), 'utf8')).toContain(
      "from './relocated/feature/a.js'",
    );
  });
});

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDirectoryMove, buildImportGraph, loadTsconfig, planDirectoryMove } from '../src/advanced.js';

function fixtureSourcePath(): string {
  return fileURLToPath(new URL('./fixtures/planner/directory-move-project', import.meta.url));
}

let tempDir: string;
let projectDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-apply-directory-move-'));
  projectDir = join(tempDir, 'directory-move-project');
  cpSync(fixtureSourcePath(), projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function findLeftoverTempFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((entry) => entry.includes('.movesafe.'));
}

describe('applyDirectoryMove', () => {
  it('relocates every file, rewrites every affected import, and leaves no temp/backup files', () => {
    const tsconfigPath = join(projectDir, 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const from = join(projectDir, 'src', 'feature');
    const to = join(projectDir, 'src', 'relocated', 'feature');

    const plan = planDirectoryMove(from, to, graph, tsconfig);
    const result = applyDirectoryMove(plan);

    expect(result.applied).toBe(true);
    expect(result.diagnostics).toEqual([]);

    expect(existsSync(from)).toBe(false);
    expect(existsSync(join(to, 'index.ts'))).toBe(true);
    expect(existsSync(join(to, 'a.ts'))).toBe(true);
    expect(existsSync(join(to, 'b.ts'))).toBe(true);
    expect(existsSync(join(to, 'c.ts'))).toBe(true);
    expect(existsSync(join(to, 'nested', 'n.ts'))).toBe(true);

    const aContent = readFileSync(join(to, 'a.ts'), 'utf8');
    expect(aContent).toContain("from './b.js'");
    expect(aContent).toContain("from '../../shared.js'");

    const bContent = readFileSync(join(to, 'b.ts'), 'utf8');
    expect(bContent).toContain("from '@app/relocated/feature/c'");

    const indexContent = readFileSync(join(to, 'index.ts'), 'utf8');
    expect(indexContent).toContain("from './a.js'");

    const externalContent = readFileSync(join(projectDir, 'src', 'external.ts'), 'utf8');
    expect(externalContent).toContain("from './relocated/feature/a.js'");
    expect(externalContent).toContain("from '@app/relocated/feature/a'");

    const externalFixedContent = readFileSync(join(projectDir, 'src', 'external-fixed.ts'), 'utf8');
    expect(externalFixedContent).toContain("from '@fixed/c'");

    expect(findLeftoverTempFiles(projectDir)).toEqual([]);
  });

  it('refuses when a file has changed since planning, leaving every file untouched', () => {
    const tsconfigPath = join(projectDir, 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const from = join(projectDir, 'src', 'feature');
    const to = join(projectDir, 'src', 'relocated', 'feature');

    const plan = planDirectoryMove(from, to, graph, tsconfig);

    const externalPath = join(projectDir, 'src', 'external.ts');
    const mutated = readFileSync(externalPath, 'utf8').replace('./feature/a.js', './feature/a-changed.js');
    writeFileSync(externalPath, mutated, 'utf8');

    const result = applyDirectoryMove(plan);

    expect(result.applied).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'stale-content' }));
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(readFileSync(externalPath, 'utf8')).toBe(mutated);
  });

  it('rolls back every completed move and edit when a later move in the batch fails', () => {
    const tsconfigPath = join(projectDir, 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const from = join(projectDir, 'src', 'feature');
    const to = join(projectDir, 'src', 'relocated', 'feature');

    const plan = planDirectoryMove(from, to, graph, tsconfig);

    // Sabotage nested/n.ts's destination: a plain file where its parent
    // directory needs to be created makes mkdirSync throw partway through
    // the batch, after other moves/edits have already completed.
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, 'nested'), 'a file, not a directory', 'utf8');

    const beforeExternal = readFileSync(join(projectDir, 'src', 'external.ts'), 'utf8');
    const beforeA = readFileSync(join(projectDir, 'src', 'feature', 'a.ts'), 'utf8');

    const result = applyDirectoryMove(plan);

    expect(result.applied).toBe(false);

    // Every original file is back (or never moved) and unchanged.
    expect(existsSync(join(projectDir, 'src', 'feature', 'index.ts'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'feature', 'a.ts'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'feature', 'b.ts'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'feature', 'c.ts'))).toBe(true);
    expect(readFileSync(join(projectDir, 'src', 'feature', 'a.ts'), 'utf8')).toBe(beforeA);
    expect(readFileSync(join(projectDir, 'src', 'external.ts'), 'utf8')).toBe(beforeExternal);

    // No destination files were left behind from the moves that did complete
    // before the failure.
    expect(existsSync(join(to, 'index.ts'))).toBe(false);
    expect(existsSync(join(to, 'a.ts'))).toBe(false);
    expect(existsSync(join(to, 'b.ts'))).toBe(false);
    expect(existsSync(join(to, 'c.ts'))).toBe(false);

    expect(findLeftoverTempFiles(projectDir)).toEqual([]);
  });
});

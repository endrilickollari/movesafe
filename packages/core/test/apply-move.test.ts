import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMove, buildImportGraph, loadTsconfig } from '../src/advanced.js';
import { planMove } from '../src/planner/plan-move.js';

function fixtureSourcePath(...segments: string[]): string {
  return fileURLToPath(new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url));
}

function copyDirRecursive(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-apply-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Copies a fixture project into the scratch temp dir and returns its path there. */
function useFixture(name: string): string {
  const dest = join(tempDir, name);
  copyDirRecursive(fixtureSourcePath(name), dest);
  return dest;
}

describe('applyMove', () => {
  it('applies a straightforward move: file relocated, importer rewritten, no leftover temp/backup files', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const result = applyMove(plan);

    expect(result).toEqual({ applied: true, diagnostics: [] });
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);

    const indexContent = readFileSync(join(projectDir, 'src', 'index.ts'), 'utf8');
    expect(indexContent).toContain("from './renamed.js'");
    expect(indexContent).not.toContain("from './utils.js'");

    const leftovers = readdirSync(join(projectDir, 'src')).filter((entry) =>
      entry.includes('.movesafe.'),
    );
    expect(leftovers).toEqual([]);
  });

  it('refuses when a target file changed since planning, leaving everything untouched', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);

    // Mutate the specifier text itself (not just unrelated content elsewhere
    // in the file) so it actually overlaps the edit's recorded span.
    const indexPath = join(projectDir, 'src', 'index.ts');
    const mutatedContent = readFileSync(indexPath, 'utf8').replace(
      "'./utils.js'",
      "'./utils-changed.js'",
    );
    writeFileSync(indexPath, mutatedContent, 'utf8');

    const result = applyMove(plan);

    expect(result.applied).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'stale-content', path: indexPath }),
    );
    expect(readFileSync(indexPath, 'utf8')).toBe(mutatedContent);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('refuses when the destination already exists', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    writeFileSync(to, 'export const surprise = 1;\n', 'utf8');

    const result = applyMove(plan);

    expect(result.applied).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'destination-already-exists', path: to }),
    );
    expect(readFileSync(from, 'utf8')).toContain('helper');
  });

  it('refuses when the source file no longer exists', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    rmSync(from);

    const result = applyMove(plan);

    expect(result.applied).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'source-file-missing', path: from }),
    );
  });

  it('rewrites the moved file\'s own outbound imports and lands it at the new path', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'consumer.ts');
    const to = join(projectDir, 'src', 'lib', 'consumer.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const result = applyMove(plan);

    expect(result).toEqual({ applied: true, diagnostics: [] });
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
    expect(readFileSync(to, 'utf8')).toContain("from '../utils.js'");
  });

  it('applies a barrel-involved move consistently across multiple edited files', () => {
    const projectDir = useFixture('barrel-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'lib', 'utils.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const result = applyMove(plan);

    expect(result).toEqual({ applied: true, diagnostics: [] });
    expect(existsSync(to)).toBe(true);
    const barrelContent = readFileSync(join(projectDir, 'src', 'index.ts'), 'utf8');
    expect(barrelContent).toContain("from './lib/utils.js'");
  });
});

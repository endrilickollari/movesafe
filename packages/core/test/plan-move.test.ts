import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, loadTsconfig, planMove } from '../src/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url).pathname;
}

const plannerSrcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'planner');

describe('planMove', () => {
  it('returns a well-formed plan with an inbound edit per importer and no diagnostics for a valid move', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.edits).toHaveLength(2);
    expect(plan.edits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: fixturePath('basic-project', 'src', 'index.ts'),
          oldText: './utils.js',
          newText: './renamed.js',
        }),
        expect.objectContaining({
          file: fixturePath('basic-project', 'src', 'consumer.ts'),
          oldText: './utils.js',
          newText: './renamed.js',
        }),
      ]),
    );
  });

  it('reports a diagnostic, and does not throw, when the source is not a graph node', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'does-not-exist.ts');
    const to = fixturePath('basic-project', 'src', 'renamed.ts');

    expect(() => planMove(from, to, graph, tsconfig)).not.toThrow();
    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.edits).toEqual([]);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'source-not-in-graph', path: from }),
    );
  });

  it('reports a diagnostic when the destination collides with an existing in-project file', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'other.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'destination-collides-with-existing-file',
        path: to,
      }),
    );
  });

  it('reports a diagnostic when source equals destination', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');

    const plan = planMove(from, from, graph, tsconfig);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'source-equals-destination' }),
    );
  });

  it('never touches disk: no file is created, modified, or deleted while planning a move', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'renamed.ts');
    const indexPath = fixturePath('basic-project', 'src', 'index.ts');

    const beforeUtils = readFileSync(from, 'utf8');
    const beforeIndex = readFileSync(indexPath, 'utf8');

    planMove(from, to, graph, tsconfig);

    expect(readFileSync(from, 'utf8')).toBe(beforeUtils);
    expect(readFileSync(indexPath, 'utf8')).toBe(beforeIndex);
    expect(() => readFileSync(to, 'utf8')).toThrow();
  });

  it('planner source imports no fs API', () => {
    for (const entry of readdirSync(plannerSrcDir)) {
      const contents = readFileSync(join(plannerSrcDir, entry), 'utf8');
      expect(contents).not.toMatch(/from ['"]node:fs['"]/);
      expect(contents).not.toMatch(/require\(['"]fs['"]\)/);
    }
  });

  it('is JSON-serializable with no data loss', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const plan = planMove(
      fixturePath('basic-project', 'src', 'utils.ts'),
      fixturePath('basic-project', 'src', 'renamed.ts'),
      graph,
      tsconfig,
    );
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});

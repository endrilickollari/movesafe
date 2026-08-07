import { describe, expect, it } from 'vitest';
import { buildImportGraph, loadTsconfig } from '../src/advanced.js';
import { planMove } from '../src/planner/plan-move.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url).pathname;
}

describe('planMove — inbound rewrites', () => {
  it('recomputes a relative specifier moved within the same directory', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('basic-project', 'src', 'index.ts'),
        oldText: './utils.js',
        newText: './renamed.js',
      }),
    );
  });

  it('recomputes a relative specifier moved into a subdirectory', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'lib', 'utils.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('basic-project', 'src', 'index.ts'),
        oldText: './utils.js',
        newText: './lib/utils.js',
      }),
    );
  });

  it('recomputes an alias specifier moved within the same directory', () => {
    const graph = buildImportGraph(fixturePath('alias-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('alias-project', 'tsconfig.json'));
    const from = fixturePath('alias-project', 'src', 'utils.ts');
    const to = fixturePath('alias-project', 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('alias-project', 'src', 'index.ts'),
        oldText: '@app/utils.js',
        newText: '@app/renamed.js',
      }),
    );
  });

  it('recomputes an alias specifier moved into a subdirectory still under the aliased root', () => {
    const graph = buildImportGraph(fixturePath('alias-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('alias-project', 'tsconfig.json'));
    const from = fixturePath('alias-project', 'src', 'utils.ts');
    const to = fixturePath('alias-project', 'src', 'lib', 'utils.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('alias-project', 'src', 'index.ts'),
        oldText: '@app/utils.js',
        newText: '@app/lib/utils.js',
      }),
    );
  });

  it('recomputes the specifier of a `declare module` augmentation targeting the moved file', () => {
    const graph = buildImportGraph(fixturePath('module-augmentation-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('module-augmentation-project', 'tsconfig.json'));
    const from = fixturePath('module-augmentation-project', 'src', 'target.ts');
    const to = fixturePath('module-augmentation-project', 'src', 'nested', 'target.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('module-augmentation-project', 'src', 'augmenter.ts'),
        oldText: './target.js',
        newText: './nested/target.js',
      }),
    );
  });

  it('refuses to rewrite an alias specifier when the move escapes the aliased root', () => {
    const graph = buildImportGraph(fixturePath('alias-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('alias-project', 'tsconfig.json'));
    const from = fixturePath('alias-project', 'src', 'utils.ts');
    const to = fixturePath('alias-project', 'other', 'utils.ts');

    expect(() => planMove(from, to, graph, tsconfig)).not.toThrow();
    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.edits).toEqual([]);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'unrecomputable-inbound-specifier',
        path: fixturePath('alias-project', 'src', 'index.ts'),
      }),
    );
  });
});

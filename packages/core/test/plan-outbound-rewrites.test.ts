import { describe, expect, it } from 'vitest';
import { buildImportGraph, loadTsconfig } from '../src/advanced.js';
import { planMove } from '../src/planner/plan-move.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url).pathname;
}

describe('planMove — outbound rewrites', () => {
  it('recomputes the moved file\'s own relative import across a directory move', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'consumer.ts');
    const to = fixturePath('basic-project', 'src', 'lib', 'consumer.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: from,
        oldText: './utils.js',
        newText: '../utils.js',
      }),
    );
  });

  it('leaves an alias outbound import untouched when the containing file moves', () => {
    const graph = buildImportGraph(fixturePath('alias-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('alias-project', 'tsconfig.json'));
    const from = fixturePath('alias-project', 'src', 'index.ts');
    const to = fixturePath('alias-project', 'src', 'pages', 'index.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.edits).toEqual([]);
  });

  it('silently skips a broken outbound import while still rewriting the valid one', () => {
    const graph = buildImportGraph(fixturePath('outbound-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('outbound-project', 'tsconfig.json'));
    const from = fixturePath('outbound-project', 'src', 'index.ts');
    const to = fixturePath('outbound-project', 'src', 'lib', 'index.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.edits).toEqual([
      expect.objectContaining({
        file: from,
        oldText: './utils.js',
        newText: '../utils.js',
      }),
    ]);
  });

  it('produces no outbound edit when a same-directory move leaves relative imports unchanged', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'consumer.ts');
    const to = fixturePath('basic-project', 'src', 'consumer2.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const outboundEdits = plan.edits.filter((edit) => edit.file === from);
    expect(outboundEdits).toEqual([]);
  });
});

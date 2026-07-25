import { describe, expect, it } from 'vitest';
import { buildImportGraph, loadTsconfig, planMove } from '../src/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url).pathname;
}

describe('planMove — barrel relocation detection', () => {
  it('flags an unambiguous wildcard re-export as a relocation candidate', () => {
    const graph = buildImportGraph(fixturePath('barrel-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('barrel-project', 'tsconfig.json'));
    const from = fixturePath('barrel-project', 'src', 'utils.ts');
    const to = fixturePath('barrel-project', 'src', 'lib', 'utils.ts');

    const plan = planMove(from, to, graph, tsconfig);

    const barrelDiagnostic = plan.diagnostics.find(
      (d) => d.code === 'barrel-reexport-relocation-candidate',
    );
    expect(barrelDiagnostic).toMatchObject({
      severity: 'warning',
      path: fixturePath('barrel-project', 'src', 'index.ts'),
    });
    expect(barrelDiagnostic?.message).not.toMatch(/renamed bindings/);

    // 2.2's existing inbound rewrite of the barrel's own specifier is unaffected.
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('barrel-project', 'src', 'index.ts'),
        oldText: './utils.js',
        newText: './lib/utils.js',
      }),
    );
  });

  it('flags a named re-export as ambiguous (may involve renamed bindings)', () => {
    const graph = buildImportGraph(fixturePath('barrel-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('barrel-project', 'tsconfig.json'));
    const from = fixturePath('barrel-project', 'src', 'named-utils.ts');
    const to = fixturePath('barrel-project', 'src', 'lib', 'named-utils.ts');

    const plan = planMove(from, to, graph, tsconfig);

    const barrelDiagnostic = plan.diagnostics.find(
      (d) => d.code === 'barrel-reexport-relocation-candidate',
    );
    expect(barrelDiagnostic).toMatchObject({
      severity: 'warning',
      path: fixturePath('barrel-project', 'src', 'index.ts'),
    });
    expect(barrelDiagnostic?.message).toMatch(/renamed bindings/);
  });

  it('does not flag anything when the destination directory has no barrel', () => {
    const graph = buildImportGraph(fixturePath('barrel-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('barrel-project', 'tsconfig.json'));
    const from = fixturePath('barrel-project', 'src', 'utils.ts');
    const to = fixturePath('barrel-project', 'src', 'other', 'utils.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(
      plan.diagnostics.filter((d) => d.code === 'barrel-reexport-relocation-candidate'),
    ).toEqual([]);
  });

  it('does not flag anything when the moved file is not re-exported by any barrel', () => {
    const graph = buildImportGraph(fixturePath('barrel-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('barrel-project', 'tsconfig.json'));
    const from = fixturePath('barrel-project', 'src', 'plain.ts');
    const to = fixturePath('barrel-project', 'src', 'lib', 'plain.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(
      plan.diagnostics.filter((d) => d.code === 'barrel-reexport-relocation-candidate'),
    ).toEqual([]);
  });

  it('does not flag anything for a same-directory move', () => {
    const graph = buildImportGraph(fixturePath('barrel-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('barrel-project', 'tsconfig.json'));
    const from = fixturePath('barrel-project', 'src', 'utils.ts');
    const to = fixturePath('barrel-project', 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    expect(
      plan.diagnostics.filter((d) => d.code === 'barrel-reexport-relocation-candidate'),
    ).toEqual([]);
  });
});

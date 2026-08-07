import { describe, expect, it } from 'vitest';
import { buildImportGraph, loadTsconfig, planDirectoryMove } from '../src/advanced.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/planner/directory-move-project/${segments.join('/')}`, import.meta.url).pathname;
}

describe('planDirectoryMove', () => {
  const graph = buildImportGraph(fixturePath('tsconfig.json'));
  const tsconfig = loadTsconfig(fixturePath('tsconfig.json'));

  it('moves every file under the source directory, preserving subtree structure', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(plan.moves).toHaveLength(5);
    expect(plan.moves).toEqual(
      expect.arrayContaining([
        { fromFilePath: fixturePath('src', 'feature', 'index.ts'), toFilePath: fixturePath('src', 'relocated', 'feature', 'index.ts') },
        { fromFilePath: fixturePath('src', 'feature', 'a.ts'), toFilePath: fixturePath('src', 'relocated', 'feature', 'a.ts') },
        { fromFilePath: fixturePath('src', 'feature', 'b.ts'), toFilePath: fixturePath('src', 'relocated', 'feature', 'b.ts') },
        { fromFilePath: fixturePath('src', 'feature', 'c.ts'), toFilePath: fixturePath('src', 'relocated', 'feature', 'c.ts') },
        {
          fromFilePath: fixturePath('src', 'feature', 'nested', 'n.ts'),
          toFilePath: fixturePath('src', 'relocated', 'feature', 'nested', 'n.ts'),
        },
      ]),
    );
  });

  it('rewrites a relative inbound specifier from an unmoved importer', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('src', 'external.ts'),
        oldText: './feature/a.js',
        newText: './relocated/feature/a.js',
      }),
    );
  });

  it('rewrites an alias inbound specifier from an unmoved importer', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('src', 'external.ts'),
        oldText: '@app/feature/a',
        newText: '@app/relocated/feature/a',
      }),
    );
  });

  it('blocks instead of guessing when an alias with a non-wildcard target becomes unrecomputable', () => {
    const project = new URL('./fixtures/planner/directory-unrecomputable-project/', import.meta.url).pathname;
    const unsafeGraph = buildImportGraph(`${project}tsconfig.json`);
    const unsafeTsconfig = loadTsconfig(`${project}tsconfig.json`);
    const plan = planDirectoryMove(
      `${project}src/feature`,
      `${project}src/relocated/feature`,
      unsafeGraph,
      unsafeTsconfig,
    );

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'unrecomputable-specifier',
        path: `${project}src/consumer.ts`,
      }),
    );
    expect(plan.status).toBe('blocked');
    expect(plan.edits.some((e) => e.file === `${project}src/consumer.ts`)).toBe(false);
  });

  it('produces no edit for two co-moving files that reference each other by a relative specifier', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.edits.some((e) => e.file === fixturePath('src', 'feature', 'a.ts') && e.oldText === './b.js')).toBe(
      false,
    );
    expect(
      plan.edits.some((e) => e.file === fixturePath('src', 'feature', 'index.ts') && e.oldText === './a.js'),
    ).toBe(false);
  });

  it('rewrites an alias specifier between two co-moving files when the alias base still covers the new location', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('src', 'feature', 'b.ts'),
        oldText: '@app/feature/c',
        newText: '@app/relocated/feature/c',
      }),
    );
  });

  it('rewrites the moved file\'s own outbound relative specifier to an unmoved target', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('src', 'feature', 'a.ts'),
        oldText: '../shared.js',
        newText: '../../shared.js',
      }),
    );
  });

  it('leaves an outbound alias specifier to an unmoved target untouched (alias does not depend on importer location)', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.edits.some((e) => e.file === fixturePath('src', 'feature', 'c.ts'))).toBe(false);
  });

  it('produces no barrel-relocation warning when a barrel and its content move together into a brand-new directory', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'relocated', 'feature'),
      graph,
      tsconfig,
    );

    expect(plan.diagnostics.some((d) => d.code === 'barrel-reexport-relocation-candidate')).toBe(false);
  });

  it('refuses when the source directory has no known source files', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'does-not-exist'),
      fixturePath('src', 'also-does-not-exist'),
      graph,
      tsconfig,
    );

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'source-directory-empty' }),
    ]);
    expect(plan.moves).toEqual([]);
    expect(plan.edits).toEqual([]);
  });

  it('refuses when source and destination are the same directory', () => {
    const plan = planDirectoryMove(fixturePath('src', 'feature'), fixturePath('src', 'feature'), graph, tsconfig);

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'source-equals-destination' }),
    );
  });

  it('refuses moving a directory into its own subtree', () => {
    const plan = planDirectoryMove(
      fixturePath('src', 'feature'),
      fixturePath('src', 'feature', 'nested'),
      graph,
      tsconfig,
    );

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'destination-under-source' }),
    );
  });

  it('refuses when the destination path is already a file', () => {
    const plan = planDirectoryMove(fixturePath('src', 'feature'), fixturePath('src', 'shared.ts'), graph, tsconfig);

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'destination-is-a-file' }),
    );
  });

  it('refuses when a computed destination collides with an existing, non-moved source file', () => {
    const plan = planDirectoryMove(fixturePath('src', 'feature'), fixturePath('src', 'other-dir'), graph, tsconfig);

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'destination-collides-with-existing-file',
        path: fixturePath('src', 'other-dir', 'a.ts'),
      }),
    );
  });
});

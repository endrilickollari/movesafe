import { describe, expect, it } from 'vitest';
import { buildImportGraph, createBuildImportGraphRuntime, loadTsconfig, verifyMovePlan } from '../src/advanced.js';
import { planMove } from '../src/planner/plan-move.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/verify/${segments.join('/')}`, import.meta.url).pathname;
}

describe('verifyMovePlan', () => {
  it('flags an edit whose rewritten specifier does not resolve against the post-move overlay', () => {
    const tsconfigPath = fixturePath('broken-and-unrelated', 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const runtime = createBuildImportGraphRuntime(tsconfig);

    const from = fixturePath('broken-and-unrelated', 'src', 'target.ts');
    const to = fixturePath('broken-and-unrelated', 'src', 'renamed.ts');
    const plan = planMove(from, to, graph, tsconfig);

    expect(plan.status).toBe('ready');
    expect(plan.edits.length).toBeGreaterThan(0);

    // Sabotage the recomputed specifier to point somewhere that can never
    // exist, simulating a rewrite the overlay should catch as broken.
    const sabotagedEdits = plan.edits.map((edit) => ({ ...edit, newText: './does-not-exist-either.js' }));

    const diagnostics = verifyMovePlan({
      moves: plan.moves,
      edits: sabotagedEdits,
      program: runtime.program,
      moduleResolutionCache: runtime.moduleResolutionCache,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'broken-import-after-move',
        path: fixturePath('broken-and-unrelated', 'src', 'consumer.ts'),
      }),
    ]);
  });

  it('does not flag a correctly rewritten edit, even when an unrelated file has a pre-existing broken import', () => {
    const tsconfigPath = fixturePath('broken-and-unrelated', 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const runtime = createBuildImportGraphRuntime(tsconfig);

    const from = fixturePath('broken-and-unrelated', 'src', 'target.ts');
    const to = fixturePath('broken-and-unrelated', 'src', 'renamed.ts');
    const plan = planMove(from, to, graph, tsconfig);

    // The unrelated file's own broken import already shows up as a graph
    // warning/edge, but never as a `MovePlan` edit — confirming this move's
    // plan never touches it.
    expect(plan.edits.some((edit) => edit.file.endsWith('unrelated-broken.ts'))).toBe(false);

    const diagnostics = verifyMovePlan({
      moves: plan.moves,
      edits: plan.edits,
      program: runtime.program,
      moduleResolutionCache: runtime.moduleResolutionCache,
    });

    expect(diagnostics).toEqual([]);
  });

  it('flags an inbound import omitted from a zero-edit plan', () => {
    const tsconfigPath = fixturePath('broken-and-unrelated', 'tsconfig.json');
    const tsconfig = loadTsconfig(tsconfigPath);
    const runtime = createBuildImportGraphRuntime(tsconfig);

    const diagnostics = verifyMovePlan({
      moves: [
        {
          fromFilePath: fixturePath('broken-and-unrelated', 'src', 'target.ts'),
          toFilePath: fixturePath('broken-and-unrelated', 'src', 'renamed.ts'),
        },
      ],
      edits: [],
      program: runtime.program,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'broken-import-after-move',
        path: fixturePath('broken-and-unrelated', 'src', 'consumer.ts'),
      }),
    ]);
  });

  it('flags an unchanged import that becomes broken in a zero-edit plan', () => {
    const tsconfigPath = fixturePath('broken-and-unrelated', 'tsconfig.json');
    const tsconfig = loadTsconfig(tsconfigPath);
    const runtime = createBuildImportGraphRuntime(tsconfig);
    const from = fixturePath('broken-and-unrelated', 'src', 'nested', 'moved-with-import.ts');
    const to = fixturePath('broken-and-unrelated', 'src', 'moved-with-import.ts');

    const diagnostics = verifyMovePlan({
      moves: [{ fromFilePath: from, toFilePath: to }],
      edits: [],
      program: runtime.program,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'broken-import-after-move',
        path: to,
      }),
    ]);
  });

  it('subtracts a pre-existing module diagnostic from the moved file baseline', () => {
    const tsconfigPath = fixturePath('broken-and-unrelated', 'tsconfig.json');
    const tsconfig = loadTsconfig(tsconfigPath);
    const runtime = createBuildImportGraphRuntime(tsconfig);
    const from = fixturePath('broken-and-unrelated', 'src', 'nested', 'moved-with-broken-import.ts');
    const to = fixturePath('broken-and-unrelated', 'src', 'moved-with-broken-import.ts');

    const diagnostics = verifyMovePlan({
      moves: [{ fromFilePath: from, toFilePath: to }],
      edits: [],
      program: runtime.program,
    });

    expect(diagnostics).toEqual([]);
  });

  it('checks CommonJS require calls that TypeScript semantic diagnostics omit', () => {
    const tsconfigPath = fixturePath('broken-and-unrelated', 'tsconfig.json');
    const tsconfig = loadTsconfig(tsconfigPath);
    const runtime = createBuildImportGraphRuntime(tsconfig);
    const from = fixturePath('broken-and-unrelated', 'src', 'nested', 'moved-with-require.ts');
    const to = fixturePath('broken-and-unrelated', 'src', 'moved-with-require.ts');

    const diagnostics = verifyMovePlan({
      moves: [{ fromFilePath: from, toFilePath: to }],
      edits: [],
      program: runtime.program,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'broken-import-after-move',
        path: to,
      }),
    ]);
  });
});

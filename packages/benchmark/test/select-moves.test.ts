import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { buildImportGraph, detectWorkspacePackages } from '@movesafe/core';
import type { ImportGraph } from '@movesafe/core';
import { describe, expect, it } from 'vitest';
import { selectMoves } from '../src/select-moves.js';

function fixturePath(...segments: string[]): string {
  return new URL(`../../core/test/fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

describe('selectMoves against real fixtures', () => {
  it('picks an existing non-entry file to move, for a plain-relative-imports project', () => {
    const graph = buildImportGraph(fixturePath('plain-relative', 'tsconfig.json'));

    const selected = selectMoves(graph);

    expect(selected.singleFile).toBeDefined();
    expect(existsSync(selected.singleFile!.from)).toBe(true);
    expect(basename(selected.singleFile!.from)).not.toBe('index.ts');
    expect(selected.singleFile!.to).toContain('__moved__');
  });

  it('does not select a crossPackage move when no workspacePackages are given', () => {
    const graph = buildImportGraph(fixturePath('plain-relative', 'tsconfig.json'));

    const selected = selectMoves(graph);

    expect(selected.crossPackage).toBeUndefined();
  });

  it('does not crash against a path-aliased project', () => {
    const graph = buildImportGraph(fixturePath('path-aliases', 'tsconfig.json'));

    expect(() => selectMoves(graph)).not.toThrow();
  });

  it('does not crash against the real pnpm-monorepo fixture, using its actual workspace packages', () => {
    const { workspacePackages } = detectWorkspacePackages(fixturePath('pnpm-monorepo'));
    const graph = buildImportGraph(fixturePath('pnpm-monorepo', 'packages', 'consumer', 'tsconfig.json'), {
      workspacePackages: Object.fromEntries(workspacePackages),
    });

    expect(() => selectMoves(graph, { workspacePackages })).not.toThrow();
  });
});

function nodeGraph(filePaths: readonly string[]): ImportGraph {
  return {
    configFilePath: '/repo/tsconfig.json',
    nodes: filePaths.map((filePath) => ({ filePath })),
    edges: [],
    warnings: [],
  };
}

describe('selectMoves directory selection (hand-built graph)', () => {
  it('picks the smallest qualifying directory, counting nested descendants', () => {
    const graph = nodeGraph([
      '/repo/src/index.ts',
      '/repo/src/small/a.ts',
      '/repo/src/small/b.ts',
      '/repo/src/big/file1.ts',
      '/repo/src/big/file2.ts',
      '/repo/src/big/file3.ts',
      '/repo/src/big/file4.ts',
      '/repo/src/big/file5.ts',
      '/repo/src/big/file6.ts',
    ]);

    const selected = selectMoves(graph);

    expect(selected.directory).toEqual({ from: '/repo/src/small', to: '/repo/src/small-moved' });
  });

  it('does not pick a directory that mostly contains subdirectories, even if few files sit directly inside it', () => {
    // Regression test: `src/` here has exactly one direct file (index.ts) but
    // 8 files nested under subdirectories. A naive "count direct children"
    // heuristic would judge `src/` the smallest directory and move the
    // entire tree — this is exactly what happened against a real clone of
    // date-fns (1493 files moved in one "directory move").
    const graph = nodeGraph([
      '/repo/src/index.ts',
      '/repo/src/a/one.ts',
      '/repo/src/a/two.ts',
      '/repo/src/b/one.ts',
      '/repo/src/b/two.ts',
      '/repo/src/c/one.ts',
      '/repo/src/c/two.ts',
      '/repo/src/d/one.ts',
      '/repo/src/d/two.ts',
    ]);

    const selected = selectMoves(graph);

    expect(selected.directory?.from).not.toBe('/repo/src');
    expect(['/repo/src/a', '/repo/src/b', '/repo/src/c', '/repo/src/d']).toContain(selected.directory?.from);
  });

  it('does not select a directory move when the only qualifying directory would be more than half the project', () => {
    const graph = nodeGraph(['/repo/src/a.ts', '/repo/src/b.ts', '/repo/src/c.ts']);

    const selected = selectMoves(graph);

    expect(selected.directory).toBeUndefined();
  });
});

describe('selectMoves crossPackage selection (hand-built graph)', () => {
  it('picks a file imported across a workspace-package boundary', () => {
    const libDir = '/repo/packages/lib';
    const consumerDir = '/repo/packages/consumer';
    const workspacePackages = new Map([
      ['@fixture/lib', libDir],
      ['@fixture/consumer', consumerDir],
    ]);

    const graph: ImportGraph = {
      configFilePath: `${consumerDir}/tsconfig.json`,
      nodes: [{ filePath: `${consumerDir}/src/index.ts` }],
      edges: [
        {
          fromFilePath: `${consumerDir}/src/index.ts`,
          specifier: '@fixture/lib',
          formKind: 'import',
          isTypeOnly: false,
          quote: "'",
          specifierOffset: { start: 0, end: 0 },
          literalOffset: { start: 0, end: 0 },
          statementOffset: { start: 0, end: 0 },
          target: {
            kind: 'outOfProject',
            resolvedFileName: `${libDir}/src/index.ts`,
            isWorkspacePackage: true,
            packageId: { name: '@fixture/lib', subModuleName: '', version: '0.0.0' },
          },
        },
      ],
      warnings: [],
    };

    const selected = selectMoves(graph, { workspacePackages });

    expect(selected.crossPackage).toEqual({
      from: `${libDir}/src/index.ts`,
      to: `${consumerDir}/src/index.ts`,
    });
  });
});

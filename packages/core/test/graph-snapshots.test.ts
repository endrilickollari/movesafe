import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, detectWorkspacePackages } from '../src/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

/**
 * Round-trips through real JSON (so the snapshot reflects exactly what
 * JSON.stringify(graph) produces — dropping undefined-valued keys the way
 * JSON does, rather than the raw JS object, which can carry extra
 * implementation-detail fields like ts.PackageId's `peerDependencies`),
 * then rewrites every string that starts with `baseDir` into a POSIX-style
 * path relative to `baseDir`. buildImportGraph reports absolute filesystem
 * paths throughout (node filePaths, edge fromFilePaths, and several
 * GraphEdgeTarget variants) — this makes committed snapshots portable
 * across machines and CI.
 */
function normalizeForSnapshot(value: unknown, baseDir: string): unknown {
  const normalizedBase = baseDir.endsWith(sep) ? baseDir : `${baseDir}${sep}`;

  function walk(node: unknown): unknown {
    if (typeof node === 'string') {
      if (node === baseDir) return '.';
      if (node.startsWith(normalizedBase)) {
        return node.slice(normalizedBase.length).split(sep).join('/');
      }
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  }

  return walk(JSON.parse(JSON.stringify(value)));
}

describe('buildImportGraph fixture-repo snapshots', () => {
  it('plain relative imports', () => {
    const graph = buildImportGraph(fixturePath('plain-relative', 'tsconfig.json'));
    expect(normalizeForSnapshot(graph, fixturePath('plain-relative'))).toMatchSnapshot();
  });

  it('aliases via tsconfig paths', () => {
    const graph = buildImportGraph(fixturePath('path-aliases', 'tsconfig.json'));
    expect(normalizeForSnapshot(graph, fixturePath('path-aliases'))).toMatchSnapshot();
  });

  it('pnpm monorepo with a cross-package import', () => {
    const graph = buildImportGraph(
      fixturePath('pnpm-monorepo', 'packages', 'consumer', 'tsconfig.json'),
      {
        workspacePackages: {
          '@fixture/lib': fixturePath(
            'pnpm-monorepo',
            'packages',
            'consumer',
            'node_modules',
            '@fixture',
            'lib',
          ),
        },
      },
    );
    expect(normalizeForSnapshot(graph, fixturePath('pnpm-monorepo'))).toMatchSnapshot();
  });

  it('barrel-heavy re-exports', () => {
    const graph = buildImportGraph(fixturePath('barrel-heavy', 'tsconfig.json'));
    expect(normalizeForSnapshot(graph, fixturePath('barrel-heavy'))).toMatchSnapshot();
  });
});

describe('detectWorkspacePackages against the pnpm-monorepo fixture', () => {
  it('discovers both real workspace packages by name and directory', () => {
    const result = detectWorkspacePackages(fixturePath('pnpm-monorepo'));
    expect(result.packageManager).toBe('pnpm');
    expect(result.diagnostics).toEqual([]);
    expect(result.workspacePackages.get('@fixture/lib')).toBe(
      fixturePath('pnpm-monorepo', 'packages', 'lib'),
    );
    expect(result.workspacePackages.get('@fixture/consumer')).toBe(
      fixturePath('pnpm-monorepo', 'packages', 'consumer'),
    );
  });
});

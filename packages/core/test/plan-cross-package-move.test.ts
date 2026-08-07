import { describe, expect, it } from 'vitest';
import { planCrossPackageMove } from '../src/advanced.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/cross-package/${segments.join('/')}`, import.meta.url).pathname;
}

function workspacePackages(...names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of names) {
    const dir = name.replace('@fixture/', '');
    map.set(name, fixturePath(dir));
  }
  return map;
}

describe('planCrossPackageMove', () => {
  it('rewrites inbound and outbound edges, and warns about the cycle and third-party dependents this move implies', () => {
    const ws = workspacePackages('@fixture/pkg-a', '@fixture/pkg-b', '@fixture/pkg-c');
    const from = fixturePath('pkg-a', 'src', 'mover.ts');
    const to = fixturePath('pkg-b', 'src', 'mover.ts');

    const plan = planCrossPackageMove(from, to, ws);

    expect(plan.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('pkg-a', 'src', 'consumer.ts'),
        oldText: './mover.js',
        newText: '@fixture/pkg-b',
      }),
    );
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('pkg-a', 'src', 'mover.ts'),
        oldText: './sibling.js',
        newText: '@fixture/pkg-a',
      }),
    );

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'circular-dependency-warning',
        message: expect.stringContaining('@fixture/pkg-b → @fixture/pkg-c → @fixture/pkg-a'),
      }),
    );

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'third-party-references-not-rewritten',
        message: expect.stringContaining('@fixture/pkg-c'),
      }),
    );
  });

  it('refuses when source and destination are in the same package', () => {
    const ws = workspacePackages('@fixture/pkg-a', '@fixture/pkg-b');
    const from = fixturePath('pkg-a', 'src', 'mover.ts');
    const to = fixturePath('pkg-a', 'src', 'renamed.ts');

    const plan = planCrossPackageMove(from, to, ws);

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'not-a-cross-package-move' }),
    ]);
    expect(plan.edits).toEqual([]);
  });

  it('refuses when the destination package has no tsconfig.json', () => {
    const ws = workspacePackages('@fixture/pkg-a', '@fixture/pkg-no-tsconfig');
    const from = fixturePath('pkg-a', 'src', 'mover.ts');
    const to = fixturePath('pkg-no-tsconfig', 'mover.ts');

    const plan = planCrossPackageMove(from, to, ws);

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'package-missing-tsconfig' }),
    ]);
  });

  it('refuses when the computed destination already exists as a source file', () => {
    const ws = workspacePackages('@fixture/pkg-a', '@fixture/pkg-b');
    const from = fixturePath('pkg-a', 'src', 'mover.ts');
    const to = fixturePath('pkg-b', 'src', 'index.ts');

    const plan = planCrossPackageMove(from, to, ws);

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'destination-collides-with-existing-file' }),
    );
  });

  it('warns instead of guessing a subpath when the destination has a multi-entry exports map', () => {
    const ws = workspacePackages('@fixture/pkg-a', '@fixture/pkg-d');
    const from = fixturePath('pkg-a', 'src', 'mover.ts');
    const to = fixturePath('pkg-d', 'src', 'mover.ts');

    const plan = planCrossPackageMove(from, to, ws);

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'unrecomputable-specifier',
        path: fixturePath('pkg-a', 'src', 'consumer.ts'),
      }),
    );
    expect(plan.edits.some((e) => e.file === fixturePath('pkg-a', 'src', 'consumer.ts'))).toBe(false);
  });

  it('refuses when the source file is not inside any known workspace package', () => {
    const ws = workspacePackages('@fixture/pkg-b');
    const from = fixturePath('pkg-a', 'src', 'mover.ts');
    const to = fixturePath('pkg-b', 'src', 'mover.ts');

    const plan = planCrossPackageMove(from, to, ws);

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'file-not-in-workspace-package' }),
    ]);
  });
});

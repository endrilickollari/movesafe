import { describe, expect, it } from 'vitest';
import { detectWorkspacePackages, loadTsconfig, resolveSpecifier } from '../src/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/workspace/${segments.join('/')}`, import.meta.url).pathname;
}

describe('detectWorkspacePackages', () => {
  it('detects a pnpm workspace and maps package name to directory', () => {
    const result = detectWorkspacePackages(fixturePath('pnpm-basic'));
    expect(result.packageManager).toBe('pnpm');
    expect(result.hasTurborepo).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.workspacePackages.get('@fixture/pkg-a')).toBe(
      fixturePath('pnpm-basic', 'packages', 'pkg-a'),
    );
    expect(result.workspacePackages.get('@fixture/pkg-b')).toBe(
      fixturePath('pnpm-basic', 'packages', 'pkg-b'),
    );
  });

  it('detects an npm workspace from the bare-array workspaces form', () => {
    const result = detectWorkspacePackages(fixturePath('npm-array'));
    expect(result.packageManager).toBe('npm');
    expect(result.diagnostics).toEqual([]);
    expect(result.workspacePackages.size).toBe(2);
  });

  it('detects a yarn workspace from the {packages:[...]} workspaces form', () => {
    const result = detectWorkspacePackages(fixturePath('yarn-object'));
    expect(result.packageManager).toBe('yarn');
    expect(result.diagnostics).toEqual([]);
    expect(result.workspacePackages.get('@fixture/pkg-a')).toBe(
      fixturePath('yarn-object', 'packages', 'pkg-a'),
    );
  });

  it('detects Turborepo independently of the package manager', () => {
    const result = detectWorkspacePackages(fixturePath('turborepo-flag'));
    expect(result.hasTurborepo).toBe(true);
    expect(result.packageManager).toBe('pnpm');
  });

  it('diagnoses a workspace pattern that matches zero packages', () => {
    const result = detectWorkspacePackages(fixturePath('zero-match-glob'));
    expect(result.workspacePackages.size).toBe(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'glob-matched-zero-packages', path: 'apps/*' }),
    );
  });

  it('diagnoses a directory with no workspace config at all', () => {
    const result = detectWorkspacePackages(fixturePath('missing-config'));
    expect(result.packageManager).toBeUndefined();
    expect(result.workspacePackages.size).toBe(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'no-workspace-config-found' }),
    );
  });

  it('diagnoses an unparsable pnpm-workspace.yaml without throwing', () => {
    const containingDir = fixturePath('malformed-yaml');
    expect(() => detectWorkspacePackages(containingDir)).not.toThrow();
    const result = detectWorkspacePackages(containingDir);
    expect(result.workspacePackages.size).toBe(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unparsable-pnpm-workspace-yaml' }),
    );
  });

  it('prefers pnpm-workspace.yaml over package.json#workspaces and diagnoses the conflict', () => {
    const result = detectWorkspacePackages(fixturePath('precedence-both-configs'));
    expect(result.packageManager).toBe('pnpm');
    expect(result.patterns).toEqual(['packages/*']);
    expect(result.workspacePackages.has('@fixture/pkg-a')).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'multiple-workspace-configs-found' }),
    );
  });

  it('detects the real monorepo\'s own workspace packages', () => {
    // Uses the real monorepo (root two levels above packages/core) as a smoke
    // test of detection itself. Deliberately does not resolve any specifier
    // through this map: that would follow @movesafe/core's package.json into
    // dist/index.d.ts, which only exists after a build step CI's test job
    // does not run first (test and build are intentionally decoupled).
    const repoRoot = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
    const { packageManager, hasTurborepo, workspacePackages } = detectWorkspacePackages(repoRoot);
    expect(packageManager).toBe('pnpm');
    expect(hasTurborepo).toBe(true);
    expect(workspacePackages.get('@movesafe/core')).toBe(`${repoRoot}/packages/core`);
    expect(workspacePackages.get('movesafe')).toBe(`${repoRoot}/packages/cli`);
  });

  it('composes with resolveSpecifier with no adapter needed', () => {
    // Self-contained fixture (no build step involved): a workspacePackages
    // map in exactly the shape detectWorkspacePackages produces, resolved
    // against the same node_modules-based workspace-package fixture 1.3's
    // own tests use.
    const resolverFixture = new URL(
      './fixtures/resolver/module-resolution/workspace-package/pkg-consumer',
      import.meta.url,
    ).pathname;
    const workspacePackages = new Map([
      ['@fixture/pkg-lib', `${resolverFixture}/node_modules/@fixture/pkg-lib`],
    ]);
    const tsconfig = loadTsconfig(`${resolverFixture}/tsconfig.json`);
    const { result } = resolveSpecifier(
      '@fixture/pkg-lib',
      `${resolverFixture}/src/index.ts`,
      tsconfig,
      { workspacePackages },
    );
    expect(result).toMatchObject({ kind: 'resolved', isWorkspacePackage: true });
  });
});

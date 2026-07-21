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

  it('composes with resolveSpecifier with no adapter needed, against the real repo', () => {
    // Uses the real monorepo (root two levels above packages/core) rather than
    // a synthetic fixture, since exercising a real pnpm-symlinked workspace
    // package is exactly what this integration is meant to prove.
    const repoRoot = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
    const { workspacePackages } = detectWorkspacePackages(repoRoot);
    expect(workspacePackages.get('@movesafe/core')).toBe(`${repoRoot}/packages/core`);
    expect(workspacePackages.get('movesafe')).toBe(`${repoRoot}/packages/cli`);

    const cliTsconfig = loadTsconfig(`${repoRoot}/packages/cli/tsconfig.json`);
    const containingFile = `${repoRoot}/packages/cli/src/index.ts`;

    const withoutMap = resolveSpecifier('@movesafe/core', containingFile, cliTsconfig);
    expect(withoutMap.result.kind).toBe('external');

    const withMap = resolveSpecifier('@movesafe/core', containingFile, cliTsconfig, {
      workspacePackages,
    });
    expect(withMap.result).toMatchObject({ kind: 'resolved', isWorkspacePackage: true });
  });
});

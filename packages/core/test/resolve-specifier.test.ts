import type * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { classifyResolvedModule, loadTsconfig, resolveSpecifier } from '../src/resolver/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/resolver/module-resolution/${segments.join('/')}`, import.meta.url)
    .pathname;
}

describe('resolveSpecifier', () => {
  it('resolves a plain relative specifier', () => {
    const tsconfig = loadTsconfig(fixturePath('relative', 'tsconfig.json'));
    const { result, warnings } = resolveSpecifier(
      './b.js',
      fixturePath('relative', 'src', 'a.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({
      kind: 'resolved',
      isWorkspacePackage: false,
      resolvedFileName: fixturePath('relative', 'src', 'b.ts'),
    });
  });

  it('resolves an aliased specifier via paths/baseUrl', () => {
    const tsconfig = loadTsconfig(fixturePath('alias', 'tsconfig.json'));
    const { result, warnings } = resolveSpecifier(
      '@app/target',
      fixturePath('alias', 'src', 'target.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({
      kind: 'resolved',
      isWorkspacePackage: false,
      resolvedFileName: fixturePath('alias', 'src', 'target.ts'),
    });
  });

  it('classifies a non-matching aliased specifier as unresolved, with a warning', () => {
    const tsconfig = loadTsconfig(fixturePath('alias', 'tsconfig.json'));
    const { result, warnings } = resolveSpecifier(
      '@app/missing',
      fixturePath('alias', 'src', 'target.ts'),
      tsconfig,
    );
    expect(result).toMatchObject({ kind: 'unresolved' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: 'unresolved', specifier: '@app/missing' });
  });

  it('classifies a real node_modules package as external', () => {
    const tsconfig = loadTsconfig(fixturePath('node-modules', 'tsconfig.json'));
    const { result, warnings } = resolveSpecifier(
      'fake-external-pkg',
      fixturePath('node-modules', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'fake-external-pkg' });
  });

  it('classifies a workspace-shaped package as external when no workspacePackages map is given', () => {
    const tsconfig = loadTsconfig(fixturePath('workspace-package', 'pkg-consumer', 'tsconfig.json'));
    const { result, warnings } = resolveSpecifier(
      '@fixture/pkg-lib',
      fixturePath('workspace-package', 'pkg-consumer', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: '@fixture/pkg-lib' });
  });

  it('reclassifies a workspace-shaped package as resolved when its directory is supplied', () => {
    const tsconfig = loadTsconfig(fixturePath('workspace-package', 'pkg-consumer', 'tsconfig.json'));
    const workspacePackages = new Map([
      [
        '@fixture/pkg-lib',
        fixturePath('workspace-package', 'pkg-consumer', 'node_modules', '@fixture', 'pkg-lib'),
      ],
    ]);
    const { result, warnings } = resolveSpecifier(
      '@fixture/pkg-lib',
      fixturePath('workspace-package', 'pkg-consumer', 'src', 'index.ts'),
      tsconfig,
      { workspacePackages },
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({
      kind: 'resolved',
      isWorkspacePackage: true,
      packageId: { name: '@fixture/pkg-lib' },
    });
  });

  it('classifies a missing relative specifier as unresolved without throwing', () => {
    const tsconfig = loadTsconfig(fixturePath('unresolved', 'tsconfig.json'));
    const containingFile = fixturePath('unresolved', 'src', 'index.ts');
    expect(() => resolveSpecifier('./does-not-exist.js', containingFile, tsconfig)).not.toThrow();
    const { result, warnings } = resolveSpecifier('./does-not-exist.js', containingFile, tsconfig);
    expect(result).toMatchObject({ kind: 'unresolved' });
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('classifyResolvedModule', () => {
  function fakeResolvedModule(overrides: Partial<ts.ResolvedModuleFull>): ts.ResolvedModuleFull {
    return {
      resolvedFileName: '/repo/node_modules/pkg/index.d.ts',
      extension: '.d.ts',
      isExternalLibraryImport: true,
      ...overrides,
    };
  }

  it('treats a non-external resolution as neither workspace nor external', () => {
    const resolvedModule = fakeResolvedModule({
      resolvedFileName: '/repo/packages/core/src/index.ts',
      isExternalLibraryImport: false,
    });
    expect(classifyResolvedModule(resolvedModule, undefined)).toEqual({
      isWorkspacePackage: false,
      isExternal: false,
    });
  });

  it('classifies an external module with no workspacePackages map as external', () => {
    const resolvedModule = fakeResolvedModule({
      resolvedFileName: '/repo/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.d.ts',
      packageId: { name: 'typescript', subModuleName: 'lib/typescript.d.ts', version: '5.9.3' },
    });
    expect(classifyResolvedModule(resolvedModule, undefined)).toEqual({
      isWorkspacePackage: false,
      isExternal: true,
    });
  });

  it('classifies a resolution under a known workspace directory as a workspace package', () => {
    const resolvedModule = fakeResolvedModule({
      resolvedFileName: '/repo/packages/core/dist/index.d.ts',
      packageId: { name: '@movesafe/core', subModuleName: 'dist/index.d.ts', version: '0.0.0' },
    });
    const workspacePackages = new Map([['@movesafe/core', '/repo/packages/core']]);
    expect(classifyResolvedModule(resolvedModule, workspacePackages)).toEqual({
      isWorkspacePackage: true,
      isExternal: false,
    });
  });

  it('does not misclassify a same-named external package outside the known workspace directory', () => {
    const resolvedModule = fakeResolvedModule({
      resolvedFileName: '/repo/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.d.ts',
      packageId: { name: 'typescript', subModuleName: 'lib/typescript.d.ts', version: '5.9.3' },
    });
    const workspacePackages = new Map([['@movesafe/core', '/repo/packages/core']]);
    expect(classifyResolvedModule(resolvedModule, workspacePackages)).toEqual({
      isWorkspacePackage: false,
      isExternal: true,
    });
  });
});

import type * as ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyResolvedModule,
  resolveSpecifier,
  type ResolveSpecifierOptions,
} from '../src/module-resolution/index.js';
import { createBuildImportGraphRuntime } from '../src/graph/index.js';
import { loadTsconfig } from '../src/tsconfig/index.js';
import type { LoadedTsconfig } from '../src/tsconfig/types.js';

function fixturePath(...segments: string[]): string {
  return fileURLToPath(
    new URL(`./fixtures/resolver/module-resolution/${segments.join('/')}`, import.meta.url),
  );
}

function resolveFromProject(
  specifier: string,
  containingFile: string,
  tsconfig: LoadedTsconfig,
  options: ResolveSpecifierOptions = {},
) {
  const runtime = createBuildImportGraphRuntime(tsconfig);
  return resolveSpecifier(specifier, containingFile, runtime.program, {
    moduleResolutionHost: runtime.moduleResolutionHost,
    moduleResolutionCache: runtime.moduleResolutionCache,
    ...options,
  });
}

describe('resolveSpecifier', () => {
  it('resolves a plain relative specifier', () => {
    const tsconfig = loadTsconfig(fixturePath('relative', 'tsconfig.json'));
    const { result, warnings } = resolveFromProject(
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
    const { result, warnings } = resolveFromProject(
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
    const { result, warnings } = resolveFromProject(
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
    const { result, warnings } = resolveFromProject(
      'fake-external-pkg',
      fixturePath('node-modules', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'fake-external-pkg' });
  });

  it('classifies a node:-prefixed built-in as external, not unresolved', () => {
    const tsconfig = loadTsconfig(fixturePath('node-builtin', 'tsconfig.json'));
    const { result, warnings } = resolveFromProject(
      'node:fs',
      fixturePath('node-builtin', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'fs' });
  });

  it('classifies a bare (unprefixed) built-in name the same way', () => {
    const tsconfig = loadTsconfig(fixturePath('node-builtin', 'tsconfig.json'));
    const { result, warnings } = resolveFromProject(
      'fs',
      fixturePath('node-builtin', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'fs' });
  });

  it('classifies a node:-prefixed subpath built-in as external', () => {
    const tsconfig = loadTsconfig(fixturePath('node-builtin', 'tsconfig.json'));
    const { result, warnings } = resolveFromProject(
      'node:fs/promises',
      fixturePath('node-builtin', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'fs/promises' });
  });

  it('classifies a bare subpath built-in the same way', () => {
    const tsconfig = loadTsconfig(fixturePath('node-builtin', 'tsconfig.json'));
    const { result, warnings } = resolveFromProject(
      'fs/promises',
      fixturePath('node-builtin', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'fs/promises' });
  });

  it('classifies a node:-only built-in with no legacy unprefixed form as external', () => {
    const tsconfig = loadTsconfig(fixturePath('node-builtin', 'tsconfig.json'));
    const { result, warnings } = resolveFromProject(
      'node:test',
      fixturePath('node-builtin', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: 'test' });
  });

  it('classifies a workspace-shaped package as external when no workspacePackages map is given', () => {
    const tsconfig = loadTsconfig(
      fixturePath('workspace-package', 'pkg-consumer', 'tsconfig.json'),
    );
    const { result, warnings } = resolveFromProject(
      '@fixture/pkg-lib',
      fixturePath('workspace-package', 'pkg-consumer', 'src', 'index.ts'),
      tsconfig,
    );
    expect(warnings).toEqual([]);
    expect(result).toMatchObject({ kind: 'external', packageName: '@fixture/pkg-lib' });
  });

  it('reclassifies a workspace-shaped package as resolved when its directory is supplied', () => {
    const tsconfig = loadTsconfig(
      fixturePath('workspace-package', 'pkg-consumer', 'tsconfig.json'),
    );
    const workspacePackages = new Map([
      [
        '@fixture/pkg-lib',
        fixturePath('workspace-package', 'pkg-consumer', 'node_modules', '@fixture', 'pkg-lib'),
      ],
    ]);
    const { result, warnings } = resolveFromProject(
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
    expect(() => resolveFromProject('./does-not-exist.js', containingFile, tsconfig)).not.toThrow();
    const { result, warnings } = resolveFromProject(
      './does-not-exist.js',
      containingFile,
      tsconfig,
    );
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
      resolvedFileName:
        '/repo/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.d.ts',
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

  it('classifies an installed copy with a known workspace package ID as workspace-owned', () => {
    const resolvedModule = fakeResolvedModule({
      resolvedFileName: '/repo/node_modules/@movesafe/core/index.d.ts',
      packageId: { name: '@movesafe/core', subModuleName: 'index.d.ts', version: '0.0.0' },
    });
    const workspacePackages = new Map([['@movesafe/core', '/repo/packages/core']]);
    expect(classifyResolvedModule(resolvedModule, workspacePackages)).toEqual({
      isWorkspacePackage: true,
      isExternal: false,
    });
  });

  it('does not misclassify a same-named external package outside the known workspace directory', () => {
    const resolvedModule = fakeResolvedModule({
      resolvedFileName:
        '/repo/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.d.ts',
      packageId: { name: 'typescript', subModuleName: 'lib/typescript.d.ts', version: '5.9.3' },
    });
    const workspacePackages = new Map([['@movesafe/core', '/repo/packages/core']]);
    expect(classifyResolvedModule(resolvedModule, workspacePackages)).toEqual({
      isWorkspacePackage: false,
      isExternal: true,
    });
  });
});

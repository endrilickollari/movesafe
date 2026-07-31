import { isBuiltin } from 'node:module';
import * as ts from 'typescript';
import type { LoadedTsconfig } from '../tsconfig/index.js';
import { classifyResolvedModule } from './classify-resolution.js';
import type {
  ResolvedSpecifier,
  ResolveSpecifierOptions,
  ResolveSpecifierResult,
  ResolveSpecifierWarning,
} from './types.js';

export function resolveSpecifier(
  specifier: string,
  containingFile: string,
  tsconfig: LoadedTsconfig,
  options: ResolveSpecifierOptions = {},
): ResolveSpecifierResult {
  const { resolvedModule } = ts.resolveModuleName(
    specifier,
    containingFile,
    tsconfig.compilerOptions,
    ts.sys,
  );

  if (resolvedModule === undefined) {
    // `ts.resolveModuleName` only does file-based resolution and has no way
    // to see the ambient `declare module 'node:fs'`-style types `@types/node`
    // provides (those are only visible to a full type-checker/Program) — so a
    // genuine Node built-in always "fails" here even though real `tsc` (and
    // Node itself) resolves it fine. `isBuiltin` is sourced from the current
    // Node runtime's own built-in list, so this never goes stale across Node
    // versions, and accepts both `node:`-prefixed and bare forms.
    if (isBuiltin(specifier)) {
      const packageName = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
      const result: ResolvedSpecifier = { kind: 'external', specifier, containingFile, packageName };
      return { result, warnings: [] };
    }

    const result: ResolvedSpecifier = { kind: 'unresolved', specifier, containingFile };
    const warnings: ResolveSpecifierWarning[] = [
      {
        kind: 'unresolved',
        specifier,
        containingFile,
        message: `Could not resolve '${specifier}' from '${containingFile}'.`,
      },
    ];
    return { result, warnings };
  }

  const { isWorkspacePackage, isExternal } = classifyResolvedModule(
    resolvedModule,
    options.workspacePackages,
  );

  if (isExternal) {
    const packageName = resolvedModule.packageId?.name;
    const warnings: ResolveSpecifierWarning[] = packageName
      ? []
      : [
          {
            kind: 'externalWithoutPackageId',
            specifier,
            containingFile,
            message: `Resolved '${specifier}' to an external module without a packageId.`,
          },
        ];
    const result: ResolvedSpecifier = { kind: 'external', specifier, containingFile, packageName };
    return { result, warnings };
  }

  const result: ResolvedSpecifier = {
    kind: 'resolved',
    specifier,
    containingFile,
    resolvedFileName: resolvedModule.resolvedFileName,
    isWorkspacePackage,
    packageId: resolvedModule.packageId,
  };
  return { result, warnings: [] };
}

import * as ts from 'typescript';
import { classifyResolvedModule } from './classify-resolution.js';
import type {
  LoadedTsconfig,
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

import { isBuiltin } from 'node:module';
import * as ts from 'typescript';
import { toFileSystemPath } from '../path-utils.js';
import { classifyResolvedModule } from './classify-resolution.js';
import { hasModuleResolutionDiagnostic } from './diagnostics.js';
import type {
  ResolvedSpecifier,
  ResolveSpecifierOptions,
  ResolveSpecifierResult,
  ResolveSpecifierWarning,
} from './types.js';

export function resolveSpecifier(
  specifier: string,
  containingFile: string,
  program: ts.Program,
  options: ResolveSpecifierOptions = {},
): ResolveSpecifierResult {
  const compilerOptions = program.getCompilerOptions();
  const semanticResolution = options.semanticResolution;
  const sourceFile = program.getSourceFile(containingFile);
  const literal =
    semanticResolution && sourceFile
      ? ts.getTokenAtPosition(sourceFile, semanticResolution.literalOffset.start)
      : undefined;
  const resolutionMode =
    sourceFile && literal && ts.isStringLiteralLike(literal)
      ? ts.getModeForUsageLocation(sourceFile, literal, compilerOptions)
      : undefined;
  const { resolvedModule } = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    options.moduleResolutionHost ?? ts.sys,
    options.moduleResolutionCache,
    undefined,
    resolutionMode,
  );

  if (resolvedModule === undefined) {
    // Keep the runtime's canonical built-in names even when no Node ambient
    // declarations are installed in the project.
    if (isBuiltin(specifier)) {
      const packageName = specifier.startsWith('node:')
        ? specifier.slice('node:'.length)
        : specifier;
      const result: ResolvedSpecifier = {
        kind: 'external',
        specifier,
        containingFile,
        packageName,
      };
      return { result, warnings: [] };
    }

    if (
      semanticResolution &&
      semanticResolution.formKind !== 'requireCall' &&
      sourceFile
    ) {
      const symbol =
        literal && ts.isStringLiteralLike(literal)
          ? program.getTypeChecker().getSymbolAtLocation(literal)
          : undefined;
      if (
        symbol &&
        !hasModuleResolutionDiagnostic(
          semanticResolution.diagnostics(),
          sourceFile,
          semanticResolution.literalOffset,
        )
      ) {
        const result: ResolvedSpecifier = {
          kind: 'external',
          specifier,
          containingFile,
          packageName: undefined,
        };
        return { result, warnings: [] };
      }
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
    resolvedFileName: toFileSystemPath(resolvedModule.resolvedFileName),
    isWorkspacePackage,
    packageId: resolvedModule.packageId,
  };
  return { result, warnings: [] };
}

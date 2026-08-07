import type * as ts from 'typescript';

export interface ResolvedModuleClassification {
  readonly isWorkspacePackage: boolean;
  readonly isExternal: boolean;
}

export function classifyResolvedModule(
  resolvedModule: ts.ResolvedModuleFull,
  workspacePackages: ReadonlyMap<string, string> | undefined,
): ResolvedModuleClassification {
  if (resolvedModule.isExternalLibraryImport !== true) {
    return { isWorkspacePackage: false, isExternal: false };
  }

  const packageName = resolvedModule.packageId?.name;
  const isWorkspacePackage = packageName ? workspacePackages?.has(packageName) === true : false;

  if (isWorkspacePackage) {
    return { isWorkspacePackage: true, isExternal: false };
  }

  return { isWorkspacePackage: false, isExternal: true };
}

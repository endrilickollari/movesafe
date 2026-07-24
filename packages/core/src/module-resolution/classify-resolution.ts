import type * as ts from 'typescript';

export interface ResolvedModuleClassification {
  readonly isWorkspacePackage: boolean;
  readonly isExternal: boolean;
}

/** TS normalizes resolved paths to forward slashes regardless of platform. */
function isUnderDirectory(filePath: string, dirPath: string): boolean {
  const normalizedDir = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  return filePath === dirPath || filePath.startsWith(normalizedDir);
}

export function classifyResolvedModule(
  resolvedModule: ts.ResolvedModuleFull,
  workspacePackages: ReadonlyMap<string, string> | undefined,
): ResolvedModuleClassification {
  if (resolvedModule.isExternalLibraryImport !== true) {
    return { isWorkspacePackage: false, isExternal: false };
  }

  const packageName = resolvedModule.packageId?.name;
  const workspaceDir = packageName ? workspacePackages?.get(packageName) : undefined;

  if (workspaceDir && isUnderDirectory(resolvedModule.resolvedFileName, workspaceDir)) {
    return { isWorkspacePackage: true, isExternal: false };
  }

  return { isWorkspacePackage: false, isExternal: true };
}

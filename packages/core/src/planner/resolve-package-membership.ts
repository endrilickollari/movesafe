import { isPathUnder } from './directory-path-utils.js';

export interface PackageMembership {
  readonly packageName: string;
  readonly packageDir: string;
}

/** Which workspace package (if any) contains `filePath`. Picks the deepest matching package directory, defensively, in case of nested package roots. */
export function resolvePackageMembership(
  filePath: string,
  workspacePackages: ReadonlyMap<string, string>,
): PackageMembership | undefined {
  let best: PackageMembership | undefined;

  for (const [packageName, packageDir] of workspacePackages) {
    if (!isPathUnder(filePath, packageDir)) continue;
    if (!best || packageDir.length > best.packageDir.length) {
      best = { packageName, packageDir };
    }
  }

  return best;
}

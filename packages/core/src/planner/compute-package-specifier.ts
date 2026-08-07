import { resolve } from 'node:path';

export type ComputePackageSpecifierResult = { readonly specifier: string } | { readonly unrecomputable: true };

function targetMatches(value: unknown, packageDir: string, targetFilePath: string): boolean {
  if (typeof value === 'string') {
    return !value.includes('*') && resolve(packageDir, value) === targetFilePath;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => targetMatches(entry, packageDir, targetFilePath));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((entry) => targetMatches(entry, packageDir, targetFilePath));
  }

  return false;
}

/** Returns a package specifier only when an existing export maps exactly to the target source file. Build-output conventions cannot be inferred safely, so ambiguous or absent mappings block the move. */
export function computePackageSpecifier(
  packageName: string,
  packageDir: string,
  exportsField: unknown,
  targetFilePath: string,
): ComputePackageSpecifierResult {
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
    return targetMatches(exportsField, packageDir, targetFilePath)
      ? { specifier: packageName }
      : { unrecomputable: true };
  }

  if (typeof exportsField === 'object' && exportsField !== null) {
    const entries = Object.entries(exportsField);
    const subpathEntries = entries.filter(([key]) => key.startsWith('.'));
    const candidates = subpathEntries.length > 0 ? subpathEntries : [['.', exportsField] as const];
    const matchingSubpaths = candidates.filter(
      ([subpath, value]) => !subpath.includes('*') && targetMatches(value, packageDir, targetFilePath),
    );

    if (matchingSubpaths.length === 1) {
      const [subpath] = matchingSubpaths[0]!;
      return { specifier: subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}` };
    }
  }

  return { unrecomputable: true };
}

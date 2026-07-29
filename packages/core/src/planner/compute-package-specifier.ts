export type ComputePackageSpecifierResult = { readonly specifier: string } | { readonly unrecomputable: true };

/**
 * The bare package name is safe whenever there's no `exports` map, or an
 * `exports` map with only a `"."` root entry (this repo's own real pattern).
 * A multi-entry/subpath `exports` map means the correct subpath can't be
 * determined without knowing the target package's source-to-build-output
 * convention, which isn't discoverable from package.json alone — refuse
 * rather than guess. Takes the already-parsed `exports` field value (or
 * `undefined`) rather than reading a file itself, so this stays disk-free.
 */
export function computePackageSpecifier(
  packageName: string,
  exportsField: unknown,
): ComputePackageSpecifierResult {
  if (exportsField === undefined) {
    return { specifier: packageName };
  }

  if (typeof exportsField === 'object' && exportsField !== null) {
    const keys = Object.keys(exportsField);
    if (keys.length === 1 && keys[0] === '.') {
      return { specifier: packageName };
    }
  }

  return { unrecomputable: true };
}

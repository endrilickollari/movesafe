export function parsePackageJsonWorkspaces(packageJson: unknown): readonly string[] | undefined {
  if (typeof packageJson !== 'object' || packageJson === null) return undefined;
  const workspaces = (packageJson as Record<string, unknown>).workspaces;

  if (Array.isArray(workspaces) && workspaces.every((entry) => typeof entry === 'string')) {
    return workspaces;
  }

  if (typeof workspaces === 'object' && workspaces !== null) {
    const packages = (workspaces as Record<string, unknown>).packages;
    if (Array.isArray(packages) && packages.every((entry) => typeof entry === 'string')) {
      return packages;
    }
  }

  return undefined;
}

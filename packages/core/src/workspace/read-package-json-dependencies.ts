import { readFileSync } from 'node:fs';

/** Names listed in `dependencies` or `devDependencies` — merged, since a dev-only internal package still creates a real ordering dependency. `undefined` on any read/parse failure. */
export function readPackageJsonDependencies(packageJsonPath: string): ReadonlySet<string> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const record = parsed as Record<string, unknown>;
  const names = new Set<string>();

  for (const field of ['dependencies', 'devDependencies']) {
    const deps = record[field];
    if (typeof deps === 'object' && deps !== null) {
      for (const name of Object.keys(deps)) {
        names.add(name);
      }
    }
  }

  return names;
}

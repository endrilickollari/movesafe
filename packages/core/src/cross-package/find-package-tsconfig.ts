import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Convention-based lookup: `<packageDir>/tsconfig.json`. Not an upward search — the exact package root is already known here, unlike the CLI's arbitrary-starting-file case. */
export function findPackageTsconfig(packageDir: string): string | undefined {
  const candidate = join(packageDir, 'tsconfig.json');
  return existsSync(candidate) ? candidate : undefined;
}

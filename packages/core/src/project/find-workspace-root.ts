import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parsePackageJsonWorkspaces } from '../workspace/parse-package-json-workspaces.js';

function hasPackageJsonWorkspaces(dir: string): boolean {
  const packageJsonPath = join(dir, 'package.json');
  if (!existsSync(packageJsonPath)) return false;
  try {
    return parsePackageJsonWorkspaces(JSON.parse(readFileSync(packageJsonPath, 'utf8'))) !== undefined;
  } catch {
    return false;
  }
}

function searchDirectory(startPath: string): string {
  let candidate = resolve(startPath);
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return statSync(candidate).isDirectory() ? candidate : dirname(candidate);
}

export function findWorkspaceRoot(startPath: string): string | undefined {
  let dir = searchDirectory(startPath);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || hasPackageJsonWorkspaces(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}


import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function searchDirectory(startPath: string): string {
  let candidate = resolve(startPath);
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return statSync(candidate).isDirectory() ? candidate : dirname(candidate);
}

export function findNearestTsconfig(startPath: string): string | undefined {
  let dir = searchDirectory(startPath);
  for (;;) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}


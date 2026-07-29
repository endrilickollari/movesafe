import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Walks upward from `startDir` (must be absolute) looking for the nearest `tsconfig.json`. Returns `undefined` if none is found before the filesystem root. */
export function findNearestTsconfig(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

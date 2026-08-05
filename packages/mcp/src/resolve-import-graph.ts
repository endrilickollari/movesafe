import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildImportGraph } from '@movesafe/core';
import type { ImportGraph } from '@movesafe/core';

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

export interface ResolvedImportGraph {
  readonly tsconfigPath: string;
  readonly graph: ImportGraph;
}

/** Finds the nearest tsconfig above `searchDir` and builds its import graph; `undefined` if no tsconfig was found. */
export function resolveImportGraph(searchDir: string): ResolvedImportGraph | undefined {
  const tsconfigPath = findNearestTsconfig(searchDir);
  if (!tsconfigPath) return undefined;
  return { tsconfigPath, graph: buildImportGraph(tsconfigPath) };
}

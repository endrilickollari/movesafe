import { buildImportGraph } from '@movesafe/core';
import type { ImportGraph } from '@movesafe/core';
import { findNearestTsconfig } from './find-tsconfig.js';

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

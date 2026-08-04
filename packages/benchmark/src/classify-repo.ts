import type { LoadedTsconfig } from '@movesafe/core';

export type RepoCategory = 'plain' | 'aliased' | 'monorepo';

export function classifyRepo(
  workspacePackages: ReadonlyMap<string, string>,
  tsconfig: LoadedTsconfig,
): RepoCategory {
  if (workspacePackages.size > 1) {
    return 'monorepo';
  }
  if (Object.keys(tsconfig.paths.paths ?? {}).length > 0) {
    return 'aliased';
  }
  return 'plain';
}

import { join } from 'node:path';
import { readPackageJsonDependencies } from './read-package-json-dependencies.js';

/** Directed graph of internal workspace dependencies: package name -> the set of other workspace package names it declares a dependency on. External dependencies are filtered out. */
export function buildWorkspaceDependencyGraph(
  workspacePackages: ReadonlyMap<string, string>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const [name, directory] of workspacePackages) {
    const deps = readPackageJsonDependencies(join(directory, 'package.json'));
    const internal = new Set<string>();
    if (deps) {
      for (const dep of deps) {
        if (dep !== name && workspacePackages.has(dep)) {
          internal.add(dep);
        }
      }
    }
    graph.set(name, internal);
  }

  return graph;
}

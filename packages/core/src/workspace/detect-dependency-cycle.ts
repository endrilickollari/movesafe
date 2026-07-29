/** Depth-first search from `to` looking for a path back to `from` in the existing dependency graph. Returns the path (starting at `to`, ending at `from`) if one exists, `undefined` otherwise. */
export function detectDependencyCycle(
  graph: ReadonlyMap<string, Set<string>>,
  from: string,
  to: string,
): readonly string[] | undefined {
  const visited = new Set<string>();
  const path: string[] = [];

  function search(current: string): boolean {
    if (current === from) {
      path.push(current);
      return true;
    }
    if (visited.has(current)) return false;
    visited.add(current);

    for (const next of graph.get(current) ?? []) {
      if (search(next)) {
        path.push(current);
        return true;
      }
    }
    return false;
  }

  if (!search(to)) return undefined;
  return path.reverse();
}

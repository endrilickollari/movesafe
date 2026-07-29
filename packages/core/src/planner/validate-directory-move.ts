import type { ImportGraph } from '../graph/types.js';
import { isPathUnder, substituteDirPrefix } from './directory-path-utils.js';
import type { MovePlanDiagnostic } from './types.js';

export function validateDirectoryMove(
  fromDirPath: string,
  toDirPath: string,
  graph: ImportGraph,
): MovePlanDiagnostic[] {
  const diagnostics: MovePlanDiagnostic[] = [];
  const movedNodes = graph.nodes.filter((n) => isPathUnder(n.filePath, fromDirPath));

  if (movedNodes.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'source-directory-empty',
      message: `${fromDirPath} contains no source files known to this project's import graph.`,
      path: fromDirPath,
    });
  }

  if (fromDirPath === toDirPath) {
    diagnostics.push({
      severity: 'error',
      code: 'source-equals-destination',
      message: `Source and destination directories are the same path: ${toDirPath}.`,
      path: toDirPath,
    });
    return diagnostics;
  }

  if (isPathUnder(toDirPath, fromDirPath)) {
    diagnostics.push({
      severity: 'error',
      code: 'destination-under-source',
      message: `Cannot move ${fromDirPath} into its own subtree at ${toDirPath}.`,
      path: toDirPath,
    });
    return diagnostics;
  }

  const nodePaths = new Set(graph.nodes.map((n) => n.filePath));
  if (nodePaths.has(toDirPath)) {
    diagnostics.push({
      severity: 'error',
      code: 'destination-is-a-file',
      message: `${toDirPath} already exists as a source file, not a directory.`,
      path: toDirPath,
    });
    return diagnostics;
  }

  const movedPaths = new Set(movedNodes.map((n) => n.filePath));
  for (const node of movedNodes) {
    const destination = substituteDirPrefix(node.filePath, fromDirPath, toDirPath);
    if (nodePaths.has(destination) && !movedPaths.has(destination)) {
      diagnostics.push({
        severity: 'error',
        code: 'destination-collides-with-existing-file',
        message: `${destination} already exists as a source file in this project's import graph.`,
        path: destination,
      });
    }
  }

  return diagnostics;
}

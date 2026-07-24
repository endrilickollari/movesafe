import type { ImportGraph } from '../graph/types.js';
import type { MovePlanDiagnostic } from './types.js';

export function validateMove(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
): MovePlanDiagnostic[] {
  const diagnostics: MovePlanDiagnostic[] = [];
  const nodePaths = new Set(graph.nodes.map((n) => n.filePath));

  if (!nodePaths.has(fromFilePath)) {
    diagnostics.push({
      severity: 'error',
      code: 'source-not-in-graph',
      message: `${fromFilePath} is not a known source file in this project's import graph.`,
      path: fromFilePath,
    });
  }

  if (fromFilePath === toFilePath) {
    diagnostics.push({
      severity: 'error',
      code: 'source-equals-destination',
      message: `Source and destination are the same path: ${toFilePath}.`,
      path: toFilePath,
    });
  } else if (nodePaths.has(toFilePath)) {
    diagnostics.push({
      severity: 'error',
      code: 'destination-collides-with-existing-file',
      message: `${toFilePath} already exists as a source file in this project's import graph.`,
      path: toFilePath,
    });
  }

  return diagnostics;
}

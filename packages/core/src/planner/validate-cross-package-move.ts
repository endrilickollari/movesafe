import type { ImportGraph } from '../graph/types.js';
import type { MovePlanDiagnostic } from './types.js';

/** Two-graph validation: source/dest belong to different packages, source file is known, destination doesn't already exist. */
export function validateCrossPackageMove(
  fromFilePath: string,
  toFilePath: string,
  sourcePackageName: string,
  destPackageName: string,
  sourcePackageGraph: ImportGraph,
  destPackageGraph: ImportGraph,
): MovePlanDiagnostic[] {
  const diagnostics: MovePlanDiagnostic[] = [];

  if (sourcePackageName === destPackageName) {
    diagnostics.push({
      severity: 'error',
      code: 'not-a-cross-package-move',
      message: `${fromFilePath} and ${toFilePath} are both in ${sourcePackageName} — use planMove or planDirectoryMove for a same-package move instead.`,
      path: toFilePath,
    });
    return diagnostics;
  }

  const sourceNodePaths = new Set(sourcePackageGraph.nodes.map((n) => n.filePath));
  if (!sourceNodePaths.has(fromFilePath)) {
    diagnostics.push({
      severity: 'error',
      code: 'source-not-in-graph',
      message: `${fromFilePath} is not a known source file in ${sourcePackageName}'s import graph.`,
      path: fromFilePath,
    });
  }

  const destNodePaths = new Set(destPackageGraph.nodes.map((n) => n.filePath));
  if (destNodePaths.has(toFilePath)) {
    diagnostics.push({
      severity: 'error',
      code: 'destination-collides-with-existing-file',
      message: `${toFilePath} already exists as a source file in ${destPackageName}'s import graph.`,
      path: toFilePath,
    });
  }

  return diagnostics;
}

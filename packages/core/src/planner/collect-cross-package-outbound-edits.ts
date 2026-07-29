import type { GraphEdgeTarget, ImportGraph } from '../graph/types.js';
import type { ComputePackageSpecifierResult } from './compute-package-specifier.js';
import { isPathUnder } from './directory-path-utils.js';
import type { CollectedEdits, Edit, MovePlanDiagnostic } from './types.js';

/**
 * A target still counts as "in the source package" for `inProject`/
 * `inProjectNonSourceFile` (both are, by construction, within the graph
 * they were resolved in). An `outOfProject` target only counts if it's a
 * raw relative specifier that happens to resolve to a file physically under
 * the source package's own directory (rare — a file outside the tsconfig
 * `include` glob) and isn't itself a workspace-package import (those
 * already use a package specifier and don't need touching).
 */
function targetStillInSourcePackage(target: GraphEdgeTarget, sourcePackageDir: string): boolean {
  switch (target.kind) {
    case 'inProject':
    case 'inProjectNonSourceFile':
      return true;
    case 'outOfProject':
      return !target.isWorkspacePackage && isPathUnder(target.resolvedFileName, sourcePackageDir);
    case 'external':
    case 'unresolved':
      return false;
  }
}

/**
 * The moved file's own relative imports that point at files remaining in
 * the source package no longer resolve once it leaves — they need to
 * become a package-level specifier back at the source package.
 */
export function collectCrossPackageOutboundEdits(
  fromFilePath: string,
  sourcePackageGraph: ImportGraph,
  sourcePackageDir: string,
  sourcePackageName: string,
  result: ComputePackageSpecifierResult,
): CollectedEdits {
  const edits: Edit[] = [];
  const diagnostics: MovePlanDiagnostic[] = [];

  const outboundEdges = sourcePackageGraph.edges.filter(
    (edge) =>
      edge.fromFilePath === fromFilePath &&
      edge.specifier.startsWith('.') &&
      targetStillInSourcePackage(edge.target, sourcePackageDir),
  );

  if (outboundEdges.length === 0) {
    return { edits, diagnostics };
  }

  for (const edge of outboundEdges) {
    if (!('specifier' in result)) {
      diagnostics.push({
        severity: 'warning',
        code: 'unrecomputable-specifier',
        message: `Could not determine a safe package-level specifier for ${sourcePackageName} — '${edge.specifier}' in the moved file left unedited.`,
        path: fromFilePath,
      });
      continue;
    }

    edits.push({
      file: fromFilePath,
      span: edge.specifierOffset,
      oldText: edge.specifier,
      newText: result.specifier,
      reason: `Outbound import specifier recomputed as a package import back to ${sourcePackageName} after cross-package move.`,
    });
  }

  return { edits, diagnostics };
}

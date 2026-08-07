import type { GraphEdgeTarget, ImportGraph } from '../graph/types.js';
import { collectEditsFromEdges } from './collect-edits-from-edges.js';
import type { ComputePackageSpecifierResult } from './compute-package-specifier.js';
import { computePackageSpecifier } from './compute-package-specifier.js';
import { isPathUnder } from './directory-path-utils.js';
import type { CollectedEdits } from './types.js';

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
  sourceExportsField: unknown,
): CollectedEdits {
  const outboundEdges = sourcePackageGraph.edges.filter(
    (edge) =>
      edge.fromFilePath === fromFilePath &&
      edge.specifier.startsWith('.') &&
      targetStillInSourcePackage(edge.target, sourcePackageDir),
  );

  return collectEditsFromEdges(outboundEdges, (edge) => {
    const targetFilePath = edge.target.kind === 'outOfProject'
      ? edge.target.resolvedFileName
      : edge.target.kind === 'inProject' || edge.target.kind === 'inProjectNonSourceFile'
        ? edge.target.filePath
        : undefined;
    const result: ComputePackageSpecifierResult = targetFilePath
      ? computePackageSpecifier(sourcePackageName, sourcePackageDir, sourceExportsField, targetFilePath)
      : { unrecomputable: true };

    if (!('specifier' in result)) {
      return {
        kind: 'unrecomputable',
        diagnostic: {
          severity: 'error',
          code: 'unrecomputable-specifier',
          message: `Could not determine a safe package-level specifier for ${sourcePackageName} — '${edge.specifier}' in the moved file left unedited.`,
          path: fromFilePath,
        },
      };
    }

    return {
      kind: 'edit',
      newSpecifier: result.specifier,
      reason: `Outbound import specifier recomputed as a package import back to ${sourcePackageName} after cross-package move.`,
    };
  });
}

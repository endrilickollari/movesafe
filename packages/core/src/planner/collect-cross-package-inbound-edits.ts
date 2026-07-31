import type { ImportGraph } from '../graph/types.js';
import { collectEditsFromEdges } from './collect-edits-from-edges.js';
import type { ComputePackageSpecifierResult } from './compute-package-specifier.js';
import type { CollectedEdits } from './types.js';

/**
 * Every importer still within the source package that references the moved
 * file — always by a relative or alias specifier, since same-package
 * imports never use a package specifier — needs to switch to a package-level
 * specifier at the destination. Every such edge gets the same new specifier
 * (package-level resolution doesn't depend on which file is importing).
 */
export function collectCrossPackageInboundEdits(
  fromFilePath: string,
  sourcePackageGraph: ImportGraph,
  destPackageName: string,
  result: ComputePackageSpecifierResult,
): CollectedEdits {
  const inboundEdges = sourcePackageGraph.edges.filter(
    (edge) => edge.target.kind === 'inProject' && edge.target.filePath === fromFilePath,
  );

  return collectEditsFromEdges(inboundEdges, (edge) => {
    if (!('specifier' in result)) {
      return {
        kind: 'unrecomputable',
        diagnostic: {
          severity: 'warning',
          code: 'unrecomputable-specifier',
          message: `Could not determine a safe package-level specifier for ${destPackageName} — '${edge.specifier}' in ${edge.fromFilePath} left unedited.`,
          path: edge.fromFilePath,
        },
      };
    }

    return {
      kind: 'edit',
      newSpecifier: result.specifier,
      reason: `Inbound import specifier recomputed as a package import after cross-package move to ${destPackageName}.`,
    };
  });
}

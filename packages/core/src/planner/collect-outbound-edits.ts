import type { GraphEdgeTarget, ImportGraph } from '../graph/types.js';
import { collectEditsFromEdges } from './collect-edits-from-edges.js';
import { computeRelativeSpecifier } from './compute-relative-specifier.js';
import type { CollectedEdits } from './types.js';

/**
 * Alias and external specifiers resolve independently of the importing
 * file's own location (aliases against `pathsBaseDir`, external packages via
 * node_modules lookup that stays robust within a project) — only relative
 * outbound specifiers need recomputing when the file containing them moves.
 */
function resolveOutboundTargetFilePath(target: GraphEdgeTarget): string | undefined {
  switch (target.kind) {
    case 'inProject':
    case 'inProjectNonSourceFile':
      return target.filePath;
    case 'outOfProject':
      return target.resolvedFileName;
    case 'external':
    case 'unresolved':
      return undefined;
  }
}

export function collectOutboundEdits(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
): CollectedEdits {
  const outboundEdges = graph.edges.filter((edge) => edge.fromFilePath === fromFilePath);

  return collectEditsFromEdges(outboundEdges, (edge) => {
    if (!edge.specifier.startsWith('.')) return { kind: 'skip' };

    const targetFilePath = resolveOutboundTargetFilePath(edge.target);
    if (targetFilePath === undefined) return { kind: 'skip' };

    const newSpecifier = computeRelativeSpecifier(toFilePath, targetFilePath, edge.specifier);
    if (newSpecifier === edge.specifier) return { kind: 'skip' };

    return { kind: 'edit', newSpecifier, reason: 'Outbound import specifier recomputed after move.' };
  });
}

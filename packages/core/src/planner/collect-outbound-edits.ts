import type { GraphEdgeTarget, ImportGraph } from '../graph/types.js';
import { computeRelativeSpecifier } from './compute-relative-specifier.js';
import type { CollectedEdits, Edit } from './types.js';

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
  const edits: Edit[] = [];

  const outboundEdges = graph.edges.filter((edge) => edge.fromFilePath === fromFilePath);

  for (const edge of outboundEdges) {
    if (!edge.specifier.startsWith('.')) continue;

    const targetFilePath = resolveOutboundTargetFilePath(edge.target);
    if (targetFilePath === undefined) continue;

    const newSpecifier = computeRelativeSpecifier(toFilePath, targetFilePath, edge.specifier);
    if (newSpecifier === edge.specifier) continue;

    edits.push({
      file: fromFilePath,
      span: edge.specifierOffset,
      oldText: edge.specifier,
      newText: newSpecifier,
      reason: 'Outbound import specifier recomputed after move.',
    });
  }

  return { edits, diagnostics: [] };
}

import type { ImportGraphEdge } from '../graph/types.js';
import type { CollectedEdits, Edit, MovePlanDiagnostic } from './types.js';

export type EdgeSpecifierResolution =
  | { readonly kind: 'edit'; readonly newSpecifier: string; readonly reason: string }
  | { readonly kind: 'skip' }
  | { readonly kind: 'unrecomputable'; readonly diagnostic: MovePlanDiagnostic };

/**
 * Shared shape behind every inbound/outbound edit collector: decide per edge
 * whether it needs a new specifier, should be left alone, or can't be safely
 * recomputed, then materialize that decision into an `Edit`/diagnostic.
 */
export function collectEditsFromEdges(
  edges: readonly ImportGraphEdge[],
  resolve: (edge: ImportGraphEdge) => EdgeSpecifierResolution,
): CollectedEdits {
  const edits: Edit[] = [];
  const diagnostics: MovePlanDiagnostic[] = [];

  for (const edge of edges) {
    const resolution = resolve(edge);
    if (resolution.kind === 'skip') continue;
    if (resolution.kind === 'unrecomputable') {
      diagnostics.push(resolution.diagnostic);
      continue;
    }

    edits.push({
      file: edge.fromFilePath,
      span: edge.specifierOffset,
      oldText: edge.specifier,
      newText: resolution.newSpecifier,
      reason: resolution.reason,
    });
  }

  return { edits, diagnostics };
}

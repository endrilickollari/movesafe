import { posix } from 'node:path';
import type { ImportGraph } from '../graph/types.js';
import type { ImportFormKind } from '../scanner/types.js';
import type { MovePlanDiagnostic } from './types.js';

const REEXPORT_FORM_KINDS: ReadonlySet<ImportFormKind> = new Set([
  'exportFrom',
  'exportStar',
  'exportStarAs',
]);

/**
 * Detects when the moved file is re-exported by a same-directory barrel and
 * the destination directory already has its own barrel — a candidate for a
 * human to relocate the re-export by hand. Does not attempt the relocation
 * itself: the scanner only captures each specifier's own text, never the
 * enclosing statement's, so there's no way to honestly populate an Edit that
 * deletes/inserts a whole re-export line without an oldText/span mismatch
 * that could confuse a future staleness check.
 */
export function detectBarrelRelocation(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
): MovePlanDiagnostic[] {
  const sourceDir = posix.dirname(fromFilePath);
  const destDir = posix.dirname(toFilePath);
  if (sourceDir === destDir) return [];

  const destBarrelPath = posix.join(destDir, 'index.ts');
  const destHasBarrel = graph.nodes.some((node) => node.filePath === destBarrelPath);
  if (!destHasBarrel) return [];

  const diagnostics: MovePlanDiagnostic[] = [];

  for (const edge of graph.edges) {
    if (edge.target.kind !== 'inProject' || edge.target.filePath !== fromFilePath) continue;
    if (!REEXPORT_FORM_KINDS.has(edge.formKind)) continue;
    if (posix.basename(edge.fromFilePath) !== 'index.ts') continue;
    if (posix.dirname(edge.fromFilePath) !== sourceDir) continue;

    const mayBeAliased = edge.formKind !== 'exportStar';
    diagnostics.push({
      severity: 'warning',
      code: 'barrel-reexport-relocation-candidate',
      message: mayBeAliased
        ? `${edge.fromFilePath} re-exports the moved file and may use renamed bindings (export ... as ...) — review whether it should move to ${destBarrelPath} instead of just updating its path.`
        : `${edge.fromFilePath} re-exports the moved file — consider moving this re-export to ${destBarrelPath}, which already exists.`,
      path: edge.fromFilePath,
    });
  }

  return diagnostics;
}

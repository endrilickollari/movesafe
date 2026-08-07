import type { GraphEdgeTarget, ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectEditsFromEdges, type EdgeSpecifierResolution } from './collect-edits-from-edges.js';
import { computeRelativeSpecifier } from './compute-relative-specifier.js';
import { detectBarrelRelocation } from './detect-barrel-relocation.js';
import { computeAliasSpecifier, matchPathsAlias } from './match-paths-alias.js';
import type { CollectedEdits } from './types.js';

/** Alias and external specifiers resolve independently of the importing file's own location — only a relative specifier can need recomputing purely because the importer moved. */
function resolveFileShapedTargetPath(target: GraphEdgeTarget): string | undefined {
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

const REASON = 'Import specifier recomputed after directory move.';

/**
 * Generalizes `collectInboundEdits`/`collectOutboundEdits` to an arbitrary
 * set of simultaneous file relocations: for every edge, asks whether the
 * importer moved and/or the target moved, and feeds whichever paths are now
 * current into the same relative/alias recomputation primitives those two
 * functions already use. A relative specifier is recomputed whenever either
 * side moved; an alias specifier only when the target moved, since alias
 * resolution never depends on the importer's own location. Two files that
 * move together and reference each other by a relative specifier naturally
 * produce no edit at all, since their relative position to one another is
 * unchanged by a uniform directory-prefix substitution.
 */
export function collectDirectoryEdits(
  movedMap: ReadonlyMap<string, string>,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): CollectedEdits {
  const collected = collectEditsFromEdges(graph.edges, (edge): EdgeSpecifierResolution => {
    const fromMoved = movedMap.has(edge.fromFilePath);
    const targetFilePath = resolveFileShapedTargetPath(edge.target);
    const targetIsMovedFile =
      edge.target.kind === 'inProject' && targetFilePath !== undefined && movedMap.has(targetFilePath);

    if ((!fromMoved && !targetIsMovedFile) || targetFilePath === undefined) {
      return { kind: 'skip' };
    }

    const newImporterFilePath = movedMap.get(edge.fromFilePath) ?? edge.fromFilePath;
    const newTargetFilePath = targetIsMovedFile ? movedMap.get(targetFilePath)! : targetFilePath;

    if (edge.specifier.startsWith('.')) {
      const newSpecifier = computeRelativeSpecifier(newImporterFilePath, newTargetFilePath, edge.specifier);
      if (newSpecifier === edge.specifier) return { kind: 'skip' };
      return { kind: 'edit', newSpecifier, reason: REASON };
    }

    if (!targetIsMovedFile) return { kind: 'skip' };

    const matched = matchPathsAlias(edge.specifier, tsconfig.paths, targetFilePath);
    const newSpecifier = matched
      ? computeAliasSpecifier(matched, tsconfig.paths, newTargetFilePath, edge.specifier)
      : undefined;

    if (newSpecifier === undefined) {
      return {
        kind: 'unrecomputable',
        diagnostic: {
          severity: 'error',
          code: 'unrecomputable-specifier',
          message: `Could not determine how to preserve the import style of '${edge.specifier}' in ${edge.fromFilePath} — left unedited.`,
          path: edge.fromFilePath,
        },
      };
    }

    if (newSpecifier === edge.specifier) return { kind: 'skip' };
    return { kind: 'edit', newSpecifier, reason: REASON };
  });

  const diagnostics = [...collected.diagnostics];
  for (const [originalPath, newPath] of movedMap) {
    diagnostics.push(...detectBarrelRelocation(originalPath, newPath, graph));
  }

  return { edits: collected.edits, diagnostics };
}

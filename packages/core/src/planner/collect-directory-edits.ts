import type { GraphEdgeTarget, ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { computeRelativeSpecifier } from './compute-relative-specifier.js';
import { detectBarrelRelocation } from './detect-barrel-relocation.js';
import { computeAliasSpecifier, matchPathsAlias } from './match-paths-alias.js';
import type { CollectedEdits, Edit, MovePlanDiagnostic } from './types.js';

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
  const edits: Edit[] = [];
  const diagnostics: MovePlanDiagnostic[] = [];

  for (const edge of graph.edges) {
    const fromMoved = movedMap.has(edge.fromFilePath);
    const targetFilePath = resolveFileShapedTargetPath(edge.target);
    const targetIsMovedFile =
      edge.target.kind === 'inProject' && targetFilePath !== undefined && movedMap.has(targetFilePath);

    if (!fromMoved && !targetIsMovedFile) continue;
    if (targetFilePath === undefined) continue;

    const newImporterFilePath = movedMap.get(edge.fromFilePath) ?? edge.fromFilePath;
    const newTargetFilePath = targetIsMovedFile ? movedMap.get(targetFilePath)! : targetFilePath;

    let newSpecifier: string;

    if (edge.specifier.startsWith('.')) {
      newSpecifier = computeRelativeSpecifier(newImporterFilePath, newTargetFilePath, edge.specifier);
    } else {
      if (!targetIsMovedFile) continue;

      const matched = matchPathsAlias(edge.specifier, tsconfig.paths, targetFilePath);
      const computed = matched
        ? computeAliasSpecifier(matched, tsconfig.paths, newTargetFilePath, edge.specifier)
        : undefined;

      if (computed === undefined) {
        diagnostics.push({
          severity: 'warning',
          code: 'unrecomputable-specifier',
          message: `Could not determine how to preserve the import style of '${edge.specifier}' in ${edge.fromFilePath} — left unedited.`,
          path: edge.fromFilePath,
        });
        continue;
      }

      newSpecifier = computed;
    }

    if (newSpecifier === edge.specifier) continue;

    edits.push({
      file: edge.fromFilePath,
      span: edge.specifierOffset,
      oldText: edge.specifier,
      newText: newSpecifier,
      reason: 'Import specifier recomputed after directory move.',
    });
  }

  for (const [originalPath, newPath] of movedMap) {
    diagnostics.push(...detectBarrelRelocation(originalPath, newPath, graph));
  }

  return { edits, diagnostics };
}

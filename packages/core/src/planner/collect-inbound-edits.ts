import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectEditsFromEdges } from './collect-edits-from-edges.js';
import { computeAliasSpecifier, matchPathsAlias } from './match-paths-alias.js';
import { computeRelativeSpecifier } from './compute-relative-specifier.js';
import type { CollectedEdits } from './types.js';

function computeNewSpecifier(
  specifier: string,
  fromFilePath: string,
  toFilePath: string,
  importerFilePath: string,
  tsconfig: LoadedTsconfig,
): string | undefined {
  if (specifier.startsWith('.')) {
    return computeRelativeSpecifier(importerFilePath, toFilePath, specifier);
  }

  const matched = matchPathsAlias(specifier, tsconfig.paths, fromFilePath);
  if (!matched) return undefined;

  return computeAliasSpecifier(matched, tsconfig.paths, toFilePath, specifier);
}

export function collectInboundEdits(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): CollectedEdits {
  const inboundEdges = graph.edges.filter(
    (edge) => edge.target.kind === 'inProject' && edge.target.filePath === fromFilePath,
  );

  return collectEditsFromEdges(inboundEdges, (edge) => {
    const newSpecifier = computeNewSpecifier(
      edge.specifier,
      fromFilePath,
      toFilePath,
      edge.fromFilePath,
      tsconfig,
    );

    if (newSpecifier === undefined) {
      return {
        kind: 'unrecomputable',
        diagnostic: {
          severity: 'error',
          code: 'unrecomputable-inbound-specifier',
          message: `Could not determine how to preserve the import style of '${edge.specifier}' in ${edge.fromFilePath} — left unedited.`,
          path: edge.fromFilePath,
        },
      };
    }

    return { kind: 'edit', newSpecifier, reason: 'Inbound import specifier recomputed after move.' };
  });
}

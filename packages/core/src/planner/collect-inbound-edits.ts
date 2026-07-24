import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { computeAliasSpecifier, matchPathsAlias } from './match-paths-alias.js';
import { computeRelativeSpecifier } from './compute-relative-specifier.js';
import type { CollectedEdits, Edit, MovePlanDiagnostic } from './types.js';

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
  const edits: Edit[] = [];
  const diagnostics: MovePlanDiagnostic[] = [];

  const inboundEdges = graph.edges.filter(
    (edge) => edge.target.kind === 'inProject' && edge.target.filePath === fromFilePath,
  );

  for (const edge of inboundEdges) {
    const newSpecifier = computeNewSpecifier(
      edge.specifier,
      fromFilePath,
      toFilePath,
      edge.fromFilePath,
      tsconfig,
    );

    if (newSpecifier === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'unrecomputable-inbound-specifier',
        message: `Could not determine how to preserve the import style of '${edge.specifier}' in ${edge.fromFilePath} — left unedited.`,
        path: edge.fromFilePath,
      });
      continue;
    }

    edits.push({
      file: edge.fromFilePath,
      span: edge.specifierOffset,
      oldText: edge.specifier,
      newText: newSpecifier,
      reason: 'Inbound import specifier recomputed after move.',
    });
  }

  return { edits, diagnostics };
}

import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectInboundEdits } from './collect-inbound-edits.js';
import { collectOutboundEdits } from './collect-outbound-edits.js';
import { detectBarrelRelocation } from './detect-barrel-relocation.js';
import type { CollectedEdits } from './types.js';

/** Produces the edits a move requires: every importer's inbound rewrite plus the moved file's own outbound rewrites, plus barrel-relocation diagnostics. */
export function collectEdits(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): CollectedEdits {
  const inbound = collectInboundEdits(fromFilePath, toFilePath, graph, tsconfig);
  const outbound = collectOutboundEdits(fromFilePath, toFilePath, graph);
  const barrelDiagnostics = detectBarrelRelocation(fromFilePath, toFilePath, graph);

  return {
    edits: [...inbound.edits, ...outbound.edits],
    diagnostics: [...inbound.diagnostics, ...outbound.diagnostics, ...barrelDiagnostics],
  };
}

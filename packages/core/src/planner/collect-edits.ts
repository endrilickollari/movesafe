import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectInboundEdits } from './collect-inbound-edits.js';
import { collectOutboundEdits } from './collect-outbound-edits.js';
import type { CollectedEdits } from './types.js';

/** Produces the edits a move requires: every importer's inbound rewrite plus the moved file's own outbound rewrites. */
export function collectEdits(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): CollectedEdits {
  const inbound = collectInboundEdits(fromFilePath, toFilePath, graph, tsconfig);
  const outbound = collectOutboundEdits(fromFilePath, toFilePath, graph);

  return {
    edits: [...inbound.edits, ...outbound.edits],
    diagnostics: [...inbound.diagnostics, ...outbound.diagnostics],
  };
}

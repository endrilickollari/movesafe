import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectInboundEdits } from './collect-inbound-edits.js';
import type { CollectedEdits } from './collect-inbound-edits.js';

/**
 * Produces the edits a move requires. Composes inbound-rewrite collection
 * (2.2) today; outbound-rewrite collection (2.3) joins in here once built.
 */
export function collectEdits(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): CollectedEdits {
  return collectInboundEdits(fromFilePath, toFilePath, graph, tsconfig);
}

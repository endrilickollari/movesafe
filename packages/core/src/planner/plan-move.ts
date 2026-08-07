import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectEdits } from './collect-edits.js';
import { finalizeMovePlan } from './finalize-move-plan.js';
import { validateMove } from './validate-move.js';
import type { Edit, MovePlan, MovePlanDiagnostic } from './types.js';

export function planMove(
  fromFilePath: string,
  toFilePath: string,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): MovePlan {
  const diagnostics: MovePlanDiagnostic[] = validateMove(fromFilePath, toFilePath, graph);
  const hasError = diagnostics.some((d) => d.severity === 'error');

  let edits: Edit[] = [];
  if (!hasError) {
    const collected = collectEdits(fromFilePath, toFilePath, graph, tsconfig);
    edits = collected.edits;
    diagnostics.push(...collected.diagnostics);
  }

  return finalizeMovePlan({
    operation: 'file',
    scope: 'project',
    moves: [{ fromFilePath, toFilePath }],
    edits,
    diagnostics,
  });
}

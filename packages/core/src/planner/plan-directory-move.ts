import type { ImportGraph } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { collectDirectoryEdits } from './collect-directory-edits.js';
import { isPathUnder, substituteDirPrefix } from './directory-path-utils.js';
import { finalizeMovePlan } from './finalize-move-plan.js';
import type { Edit, FileMove, MovePlan } from './types.js';
import { validateDirectoryMove } from './validate-directory-move.js';

export function planDirectoryMove(
  fromDirPath: string,
  toDirPath: string,
  graph: ImportGraph,
  tsconfig: LoadedTsconfig,
): MovePlan {
  const diagnostics = validateDirectoryMove(fromDirPath, toDirPath, graph);
  const hasError = diagnostics.some((d) => d.severity === 'error');

  let moves: FileMove[] = [];
  let edits: Edit[] = [];

  if (!hasError) {
    const movedNodes = graph.nodes.filter((n) => isPathUnder(n.filePath, fromDirPath));
    const movedMap = new Map<string, string>();
    for (const node of movedNodes) {
      movedMap.set(node.filePath, substituteDirPrefix(node.filePath, fromDirPath, toDirPath));
    }

    moves = movedNodes.map((n) => ({ fromFilePath: n.filePath, toFilePath: movedMap.get(n.filePath)! }));

    const collected = collectDirectoryEdits(movedMap, graph, tsconfig);
    edits = collected.edits;
    diagnostics.push(...collected.diagnostics);
  }

  return finalizeMovePlan({
    operation: 'directory',
    scope: 'project',
    moves,
    edits,
    diagnostics,
    sourceDirectory: fromDirPath,
  });
}

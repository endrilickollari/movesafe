import type { ImportGraph, ImportGraphEdge } from '../graph/types.js';
import type { ImportGraphIndex } from './types.js';

function append(map: Map<string, ImportGraphEdge[]>, key: string, edge: ImportGraphEdge): void {
  const edges = map.get(key);
  if (edges) edges.push(edge);
  else map.set(key, [edge]);
}

export function buildImportGraphIndex(graph: ImportGraph): ImportGraphIndex {
  const inboundByTarget = new Map<string, ImportGraphEdge[]>();
  const outboundBySource = new Map<string, ImportGraphEdge[]>();

  for (const edge of graph.edges) {
    append(outboundBySource, edge.fromFilePath, edge);
    if (edge.target.kind === 'inProject') append(inboundByTarget, edge.target.filePath, edge);
  }

  return {
    nodePaths: new Set(graph.nodes.map((node) => node.filePath)),
    inboundByTarget,
    outboundBySource,
  };
}


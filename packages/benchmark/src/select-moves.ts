import { basename, dirname, join, relative } from 'node:path';
import type { ImportGraph, ImportGraphNode } from '@movesafe/core/advanced';

export interface MoveCandidate {
  readonly from: string;
  readonly to: string;
}

export interface SelectedMoves {
  readonly singleFile: MoveCandidate | undefined;
  readonly directory: MoveCandidate | undefined;
  readonly crossPackage: MoveCandidate | undefined;
}

const ENTRY_OR_BARREL_RE = /^(index|main)\.tsx?$/i;
const TEST_FILE_RE = /\.(test|spec)\.tsx?$/i;

function countInboundEdges(graph: ImportGraph, filePath: string): number {
  let count = 0;
  for (const edge of graph.edges) {
    if (edge.target.kind === 'inProject' && edge.target.filePath === filePath) {
      count++;
    }
  }
  return count;
}

/** Picks the non-entry, non-test file with the most importers, to exercise inbound-rewrite logic across many callers. */
function selectSingleFileMove(graph: ImportGraph): MoveCandidate | undefined {
  let best: { node: ImportGraphNode; inbound: number } | undefined;

  for (const node of graph.nodes) {
    const name = basename(node.filePath);
    if (ENTRY_OR_BARREL_RE.test(name) || TEST_FILE_RE.test(name)) {
      continue;
    }

    const inbound = countInboundEdges(graph, node.filePath);
    if (inbound === 0) {
      continue;
    }
    if (!best || inbound > best.inbound) {
      best = { node, inbound };
    }
  }

  if (!best) {
    return undefined;
  }

  const dir = dirname(best.node.filePath);
  const name = basename(best.node.filePath);
  return { from: best.node.filePath, to: join(dir, '__moved__', name) };
}

/**
 * Picks the smallest non-trivial directory (>=2 files, counting all nested
 * descendants — not just direct children) to move as a unit. Counting only
 * direct children would misjudge a directory like `src/` that mostly
 * contains subdirectories (few files directly inside it) as "small," when
 * moving it actually relocates everything nested underneath.
 */
function selectDirectoryMove(graph: ImportGraph): MoveCandidate | undefined {
  const candidateDirs = new Set<string>();
  for (const node of graph.nodes) {
    candidateDirs.add(dirname(node.filePath));
  }

  let best: { dir: string; count: number } | undefined;
  for (const dir of candidateDirs) {
    const prefix = `${dir}/`;
    let count = 0;
    for (const node of graph.nodes) {
      if (node.filePath.startsWith(prefix)) {
        count++;
      }
    }

    if (count < 2 || count > graph.nodes.length / 2) {
      continue;
    }
    if (!best || count < best.count) {
      best = { dir, count };
    }
  }

  if (!best) {
    return undefined;
  }

  const parent = dirname(best.dir);
  const name = basename(best.dir);
  return { from: best.dir, to: join(parent, `${name}-moved`) };
}

function packageDirFor(filePath: string, workspacePackages: ReadonlyMap<string, string>): string | undefined {
  for (const dir of workspacePackages.values()) {
    if (filePath === dir || filePath.startsWith(`${dir}/`)) {
      return dir;
    }
  }
  return undefined;
}

/** Picks a file imported across a workspace-package boundary, to move it into the package that actually imports it. */
function selectCrossPackageMove(
  graph: ImportGraph,
  workspacePackages: ReadonlyMap<string, string>,
): MoveCandidate | undefined {
  for (const edge of graph.edges) {
    if (edge.target.kind !== 'outOfProject' || !edge.target.isWorkspacePackage) {
      continue;
    }

    const importerPackageDir = packageDirFor(edge.fromFilePath, workspacePackages);
    const targetPackageDir = packageDirFor(edge.target.resolvedFileName, workspacePackages);
    if (!importerPackageDir || !targetPackageDir || importerPackageDir === targetPackageDir) {
      continue;
    }

    const relativeFromTargetPackage = relative(targetPackageDir, edge.target.resolvedFileName);
    return {
      from: edge.target.resolvedFileName,
      to: join(importerPackageDir, relativeFromTargetPackage),
    };
  }
  return undefined;
}

export function selectMoves(
  graph: ImportGraph,
  options?: { readonly workspacePackages?: ReadonlyMap<string, string> },
): SelectedMoves {
  return {
    singleFile: selectSingleFileMove(graph),
    directory: selectDirectoryMove(graph),
    crossPackage: options?.workspacePackages ? selectCrossPackageMove(graph, options.workspacePackages) : undefined,
  };
}

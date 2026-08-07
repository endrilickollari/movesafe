import type { GraphWarning, ImportGraph, ImportGraphEdge } from '../graph/types.js';
import { canonicalPath } from '../path-utils.js';
import { analyzeProject } from './analyze-project.js';
import { buildImportGraphIndex } from './build-import-graph-index.js';
import { createWorkspaceImportResolver } from './resolve-workspace-import.js';
import type { ProjectAnalysis, WorkspaceAnalysis, WorkspaceContext } from './types.js';

function aggregateGraph(context: WorkspaceContext, projects: readonly ProjectAnalysis[]): ImportGraph {
  const nodes = new Map<string, ImportGraph['nodes'][number]>();
  const edges = new Map<string, ImportGraphEdge>();
  const warnings = new Map<string, GraphWarning>();

  for (const project of projects) {
    for (const node of project.graph.nodes) nodes.set(canonicalPath(node.filePath), node);
  }
  const resolveWorkspaceImport = createWorkspaceImportResolver(context, [...nodes.values()]);

  for (const project of projects) {
    for (const edge of project.graph.edges) {
      const workspaceTarget = resolveWorkspaceImport(edge);
      const target = workspaceTarget
        ? { kind: 'inProject' as const, filePath: workspaceTarget }
        : edge.target;
      const aggregatedEdge = { ...edge, target };
      edges.set(
        `${canonicalPath(edge.fromFilePath)}\0${edge.specifierOffset.start}\0${edge.specifierOffset.end}`,
        aggregatedEdge,
      );
    }
    for (const warning of project.graph.warnings) {
      warnings.set(JSON.stringify(warning), warning);
    }
  }

  return {
    configFilePath: context.rootDir,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    warnings: [...warnings.values()],
  };
}

export function analyzeWorkspace(context: WorkspaceContext): WorkspaceAnalysis {
  const projects = context.projects.map((project) =>
    analyzeProject(project.configFilePath, {
      tsconfig: project.tsconfig,
      workspacePackages: context.workspacePackages,
    }),
  );
  const graph = aggregateGraph(context, projects);
  return { context, projects, graph, index: buildImportGraphIndex(graph) };
}

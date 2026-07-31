import type { ImportGraph } from '../graph/types.js';
import type { CheckFinding } from './types.js';

/** Every edge TypeScript couldn't resolve at all — cross-referenced against `graph.warnings` for the human-readable reason, since the edge target itself carries none. */
export function checkUnresolvedImports(graph: ImportGraph): CheckFinding[] {
  const findings: CheckFinding[] = [];

  const unresolvedEdges = graph.edges.filter((edge) => edge.target.kind === 'unresolved');

  for (const edge of unresolvedEdges) {
    const match = graph.warnings.find(
      (w) =>
        w.source === 'resolver' &&
        w.warning.kind === 'unresolved' &&
        w.warning.specifier === edge.specifier &&
        w.warning.containingFile === edge.fromFilePath,
    );

    const message =
      match && match.source === 'resolver' ? match.warning.message : `Could not resolve '${edge.specifier}'.`;

    findings.push({
      severity: 'error',
      code: 'unresolved-import',
      message,
      path: edge.fromFilePath,
    });
  }

  return findings;
}

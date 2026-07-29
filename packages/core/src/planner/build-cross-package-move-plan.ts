import type { ImportGraph } from '../graph/types.js';
import { detectDependencyCycle } from '../workspace/detect-dependency-cycle.js';
import { collectCrossPackageInboundEdits } from './collect-cross-package-inbound-edits.js';
import { collectCrossPackageOutboundEdits } from './collect-cross-package-outbound-edits.js';
import type { ComputePackageSpecifierResult } from './compute-package-specifier.js';
import type { Edit, MovePlan, MovePlanDiagnostic } from './types.js';
import { validateCrossPackageMove } from './validate-cross-package-move.js';

export interface CrossPackageMoveSide {
  readonly packageName: string;
  readonly packageDir: string;
  readonly graph: ImportGraph;
  /** The specifier another package would use to reference this one, given this package's already-parsed `exports` field. */
  readonly specifierResult: ComputePackageSpecifierResult;
}

function dependentsOf(depGraph: ReadonlyMap<string, Set<string>>, packageName: string): string[] {
  const dependents: string[] = [];
  for (const [name, deps] of depGraph) {
    if (name !== packageName && deps.has(packageName)) {
      dependents.push(name);
    }
  }
  return dependents;
}

/**
 * Pure combiner: takes every already-built input (both packages' graphs,
 * how each is referenced from outside, and the existing workspace
 * dependency graph) and assembles the final plan — no disk I/O, matching
 * every other planner function's disk-free guarantee. Loading tsconfigs,
 * graphs, and package.json contents is the caller's job, in the
 * `cross-package/` sibling module.
 */
export function buildCrossPackageMovePlan(
  fromFilePath: string,
  toFilePath: string,
  source: CrossPackageMoveSide,
  dest: CrossPackageMoveSide,
  workspaceDependencyGraph: ReadonlyMap<string, Set<string>>,
): MovePlan {
  const diagnostics: MovePlanDiagnostic[] = validateCrossPackageMove(
    fromFilePath,
    toFilePath,
    source.packageName,
    dest.packageName,
    source.graph,
    dest.graph,
  );

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { fromFilePath, toFilePath, edits: [], diagnostics };
  }

  const edits: Edit[] = [];

  const inbound = collectCrossPackageInboundEdits(fromFilePath, source.graph, dest.packageName, dest.specifierResult);
  edits.push(...inbound.edits);
  diagnostics.push(...inbound.diagnostics);

  const outbound = collectCrossPackageOutboundEdits(
    fromFilePath,
    source.graph,
    source.packageDir,
    source.packageName,
    source.specifierResult,
  );
  edits.push(...outbound.edits);
  diagnostics.push(...outbound.diagnostics);

  const cyclePath = detectDependencyCycle(workspaceDependencyGraph, source.packageName, dest.packageName);
  if (cyclePath) {
    diagnostics.push({
      severity: 'warning',
      code: 'circular-dependency-warning',
      message: `Moving this file will require ${source.packageName} to depend on ${dest.packageName}, which already (transitively) depends back on ${source.packageName}: ${cyclePath.join(' → ')}.`,
      path: fromFilePath,
    });
  }

  const dependents = dependentsOf(workspaceDependencyGraph, source.packageName);
  if (dependents.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'third-party-references-not-rewritten',
      message: `${dependents.join(', ')} also depend on ${source.packageName} and may already import the moved file via its old package specifier — movesafe cannot detect or rewrite those references automatically; please search for them manually.`,
      path: fromFilePath,
    });
  }

  return { fromFilePath, toFilePath, edits, diagnostics };
}

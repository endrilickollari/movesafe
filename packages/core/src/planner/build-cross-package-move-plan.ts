import type { ImportGraph } from '../graph/types.js';
import { detectDependencyCycle } from '../workspace/detect-dependency-cycle.js';
import { collectCrossPackageInboundEdits } from './collect-cross-package-inbound-edits.js';
import { collectCrossPackageOutboundEdits } from './collect-cross-package-outbound-edits.js';
import type { ComputePackageSpecifierResult } from './compute-package-specifier.js';
import { computePackageSpecifier } from './compute-package-specifier.js';
import { finalizeMovePlan } from './finalize-move-plan.js';
import { isPathUnder } from './directory-path-utils.js';
import { resolvePackageMembership } from './resolve-package-membership.js';
import type { Edit, MovePlan, MovePlanDiagnostic } from './types.js';
import { validateCrossPackageMove } from './validate-cross-package-move.js';

export interface CrossPackageMoveSide {
  readonly packageName: string;
  readonly packageDir: string;
  readonly graph: ImportGraph;
  readonly exportsField: unknown;
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
  options: {
    readonly workspaceWide?: boolean;
    readonly workspacePackages?: ReadonlyMap<string, string>;
  } = {},
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
    return finalizeMovePlan({
      operation: 'file',
      scope: 'workspace',
      moves: [{ fromFilePath, toFilePath }],
      edits: [],
      diagnostics,
    });
  }

  const edits: Edit[] = [];

  const destSpecifierResult: ComputePackageSpecifierResult = computePackageSpecifier(
    dest.packageName,
    dest.packageDir,
    dest.exportsField,
    toFilePath,
  );
  const inbound = collectCrossPackageInboundEdits(
    fromFilePath,
    toFilePath,
    source.graph,
    dest.packageName,
    dest.packageDir,
    destSpecifierResult,
  );
  edits.push(...inbound.edits);
  diagnostics.push(...inbound.diagnostics);

  const outbound = collectCrossPackageOutboundEdits(
    fromFilePath,
    source.graph,
    source.packageDir,
    source.packageName,
    source.exportsField,
  );
  edits.push(...outbound.edits);
  diagnostics.push(...outbound.diagnostics);

  const packageNames = new Set([source.packageName, dest.packageName, ...(options.workspacePackages?.keys() ?? [])]);
  const missingDependencies = new Set<string>();
  for (const edit of edits) {
    const importedPackage = [...packageNames]
      .sort((a, b) => b.length - a.length)
      .find((name) => edit.newText === name || edit.newText.startsWith(`${name}/`));
    if (!importedPackage) continue;

    const importerPath = edit.file === fromFilePath ? toFilePath : edit.file;
    const importerPackage = edit.file === fromFilePath
      ? dest.packageName
      : isPathUnder(edit.file, source.packageDir)
        ? source.packageName
        : isPathUnder(edit.file, dest.packageDir)
          ? dest.packageName
          : options.workspacePackages
            ? resolvePackageMembership(edit.file, options.workspacePackages)?.packageName
            : undefined;
    if (
      importerPackage &&
      importerPackage !== importedPackage &&
      !workspaceDependencyGraph.get(importerPackage)?.has(importedPackage)
    ) {
      const dependency = `${importerPackage}\0${importedPackage}`;
      if (missingDependencies.has(dependency)) continue;
      missingDependencies.add(dependency);
      diagnostics.push({
        severity: 'error',
        code: 'missing-workspace-dependency',
        message: `${importerPackage} does not declare a dependency on ${importedPackage}, required by the planned '${edit.newText}' import.`,
        path: importerPath,
      });
    }
  }

  const cyclePath = detectDependencyCycle(workspaceDependencyGraph, source.packageName, dest.packageName);
  if (cyclePath) {
    diagnostics.push({
      severity: 'warning',
      code: 'circular-dependency-warning',
      message: `Moving this file will require ${source.packageName} to depend on ${dest.packageName}, which already (transitively) depends back on ${source.packageName}: ${cyclePath.join(' → ')}.`,
      path: fromFilePath,
    });
  }

  const dependents = options.workspaceWide ? [] : dependentsOf(workspaceDependencyGraph, source.packageName);
  if (dependents.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'third-party-references-not-rewritten',
      message: `${dependents.join(', ')} also depend on ${source.packageName} and may already import the moved file via its old package specifier — movesafe cannot detect or rewrite those references automatically; please search for them manually.`,
      path: fromFilePath,
    });
  }

  return finalizeMovePlan({
    operation: 'file',
    scope: 'workspace',
    moves: [{ fromFilePath, toFilePath }],
    edits,
    diagnostics,
  });
}

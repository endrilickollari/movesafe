import { buildImportGraph } from '../graph/build-import-graph.js';
import { buildCrossPackageMovePlan } from '../planner/build-cross-package-move-plan.js';
import { computePackageSpecifier } from '../planner/compute-package-specifier.js';
import { resolvePackageMembership } from '../planner/resolve-package-membership.js';
import type { MovePlan, MovePlanDiagnostic } from '../planner/types.js';
import type { ImportGraph } from '../graph/types.js';
import { buildWorkspaceDependencyGraph } from '../workspace/build-workspace-dependency-graph.js';
import { findPackageTsconfig } from './find-package-tsconfig.js';
import { readPackageExportsField } from './read-package-exports-field.js';

function emptyPlan(fromFilePath: string, toFilePath: string, diagnostic: MovePlanDiagnostic): MovePlan {
  return { fromFilePath, toFilePath, edits: [], diagnostics: [diagnostic] };
}

export interface PlanCrossPackageMoveOptions {
  readonly workspaceGraph?: ImportGraph;
}

/**
 * The real, disk-touching entry point for a cross-package move: resolves
 * which workspace packages `fromFilePath`/`toFilePath` belong to, loads
 * both packages' tsconfigs/graphs/`package.json` exports, builds the
 * workspace dependency graph, and hands everything to the pure
 * `buildCrossPackageMovePlan` in `planner/` to assemble the final plan.
 */
export function planCrossPackageMove(
  fromFilePath: string,
  toFilePath: string,
  workspacePackages: ReadonlyMap<string, string>,
  options: PlanCrossPackageMoveOptions = {},
): MovePlan {
  const source = resolvePackageMembership(fromFilePath, workspacePackages);
  if (!source) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'file-not-in-workspace-package',
      message: `${fromFilePath} is not inside any known workspace package.`,
      path: fromFilePath,
    });
  }

  const dest = resolvePackageMembership(toFilePath, workspacePackages);
  if (!dest) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'file-not-in-workspace-package',
      message: `${toFilePath} is not inside any known workspace package.`,
      path: toFilePath,
    });
  }

  if (source.packageName === dest.packageName) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'not-a-cross-package-move',
      message: `${fromFilePath} and ${toFilePath} are both in ${source.packageName} — use planMove or planDirectoryMove for a same-package move instead.`,
      path: toFilePath,
    });
  }

  const sourceTsconfigPath = findPackageTsconfig(source.packageDir);
  if (!sourceTsconfigPath) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'package-missing-tsconfig',
      message: `${source.packageName} (${source.packageDir}) has no tsconfig.json.`,
      path: source.packageDir,
    });
  }

  const destTsconfigPath = findPackageTsconfig(dest.packageDir);
  if (!destTsconfigPath) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'package-missing-tsconfig',
      message: `${dest.packageName} (${dest.packageDir}) has no tsconfig.json.`,
      path: dest.packageDir,
    });
  }

  const workspacePackagesRecord = Object.fromEntries(workspacePackages);
  const sourceGraph =
    options.workspaceGraph ??
    buildImportGraph(sourceTsconfigPath, { workspacePackages: workspacePackagesRecord });
  const destGraph = buildImportGraph(destTsconfigPath, { workspacePackages: workspacePackagesRecord });

  const sourceSpecifierResult = computePackageSpecifier(
    source.packageName,
    readPackageExportsField(source.packageDir),
  );
  const destSpecifierResult = computePackageSpecifier(dest.packageName, readPackageExportsField(dest.packageDir));

  const workspaceDependencyGraph = buildWorkspaceDependencyGraph(workspacePackages);

  return buildCrossPackageMovePlan(
    fromFilePath,
    toFilePath,
    { packageName: source.packageName, packageDir: source.packageDir, graph: sourceGraph, specifierResult: sourceSpecifierResult },
    { packageName: dest.packageName, packageDir: dest.packageDir, graph: destGraph, specifierResult: destSpecifierResult },
    workspaceDependencyGraph,
    { workspaceWide: options.workspaceGraph !== undefined },
  );
}

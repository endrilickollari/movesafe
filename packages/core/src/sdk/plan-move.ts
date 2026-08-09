import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { planCrossPackageMove } from '../cross-package/plan-cross-package-move.js';
import { isPathUnder } from '../planner/directory-path-utils.js';
import { finalizeMovePlan, mergeVerificationDiagnostics } from '../planner/finalize-move-plan.js';
import { planDirectoryMove } from '../planner/plan-directory-move.js';
import { planMove as planProjectMove } from '../planner/plan-move.js';
import { resolvePackageMembership } from '../planner/resolve-package-membership.js';
import { collectSealPaths, sealMovePlan } from '../planner/seal-move-plan.js';
import type { MovePlan, MovePlanDiagnostic, MovePlanOperation } from '../planner/types.js';
import { canonicalPath, isPathInside } from '../path-utils.js';
import { analyzeProject } from '../project/analyze-project.js';
import { analyzeWorkspace } from '../project/analyze-workspace.js';
import { discoverWorkspaceContext } from '../project/discover-workspace-context.js';
import type { WorkspaceContext, WorkspaceProject } from '../project/types.js';
import { verifyMovePlan } from '../verify/index.js';
import type { PlanMoveOptions, PlanMoveTiming } from './types.js';

function measure<T>(
  phase: PlanMoveTiming['phase'],
  onTiming: PlanMoveOptions['onTiming'],
  operation: () => T,
): T {
  const startedAt = performance.now();
  const result = operation();
  onTiming?.({ phase, durationMs: performance.now() - startedAt });
  return result;
}

function emptyPlan(
  operation: MovePlanOperation,
  fromFilePath: string,
  toFilePath: string,
  diagnostic: MovePlanDiagnostic,
): MovePlan {
  return finalizeMovePlan({
    operation,
    scope: 'project',
    moves: [{ fromFilePath, toFilePath }],
    edits: [],
    diagnostics: [diagnostic],
    sourceDirectory: operation === 'directory' ? fromFilePath : undefined,
  });
}

function projectForFile(context: WorkspaceContext, filePath: string): WorkspaceProject | undefined {
  const sourcePath = canonicalPath(filePath);
  return context.projects
    .filter((project) =>
      project.tsconfig.fileNames.some((candidate) => canonicalPath(candidate) === sourcePath),
    )
    .sort((a, b) => b.configFilePath.length - a.configFilePath.length)[0];
}

/** Directory analog of `projectForFile`: the most specific project that contains at least one file under `dirPath`. */
function projectForDirectory(
  context: WorkspaceContext,
  dirPath: string,
): WorkspaceProject | undefined {
  const sourceDir = canonicalPath(dirPath);
  return context.projects
    .filter((project) =>
      project.tsconfig.fileNames.some((candidate) =>
        isPathUnder(canonicalPath(candidate), sourceDir),
      ),
    )
    .sort((a, b) => b.configFilePath.length - a.configFilePath.length)[0];
}

/**
 * The single exhaustive dispatcher for every supported relocation: resolves
 * whether `from` is a file or a directory, whether it crosses a workspace
 * package boundary, and delegates to the matching planner. A same-project
 * plan that reaches `ready` is then handed to `verifyMovePlan` — an
 * in-memory overlay proving every affected import still resolves post-move
 * — before being returned. Cross-package package imports are constrained by
 * existing exports and declared dependency edges in their own planner.
 */
export function planMove(options: PlanMoveOptions): MovePlan {
  const cwd = options.cwd ?? process.cwd();
  const fromFilePath = resolve(cwd, options.from);
  const toFilePath = resolve(cwd, options.to);

  if (!existsSync(fromFilePath)) {
    return emptyPlan('file', fromFilePath, toFilePath, {
      severity: 'error',
      code: 'source-file-missing',
      message: `Cannot find file: ${fromFilePath}`,
      path: fromFilePath,
    });
  }

  const isDirectory = statSync(fromFilePath).isDirectory();
  const operation: MovePlanOperation = isDirectory ? 'directory' : 'file';

  const context = discoverWorkspaceContext(isDirectory ? fromFilePath : dirname(fromFilePath));
  if (context.projects.length === 0) {
    return emptyPlan(operation, fromFilePath, toFilePath, {
      severity: 'error',
      code: 'tsconfig-not-found',
      message: `Could not find a tsconfig.json above ${fromFilePath}.`,
      path: fromFilePath,
    });
  }

  const sourcePackage = resolvePackageMembership(fromFilePath, context.workspacePackages);
  const destinationPackage = resolvePackageMembership(toFilePath, context.workspacePackages);

  if (isDirectory && sourcePackage?.packageName !== destinationPackage?.packageName) {
    return emptyPlan(operation, fromFilePath, toFilePath, {
      severity: 'error',
      code: 'cross-package-directory-unsupported',
      message:
        'Cross-package directory moves are not supported; move files individually so each package boundary can be verified.',
      path: toFilePath,
    });
  }

  if (!isDirectory) {
    if (
      sourcePackage &&
      destinationPackage &&
      sourcePackage.packageName !== destinationPackage.packageName
    ) {
      const workspaceContext = discoverWorkspaceContext(context.rootDir);
      const workspace = measure('analysis', options.onTiming, () =>
        analyzeWorkspace(workspaceContext),
      );
      return planCrossPackageMove(fromFilePath, toFilePath, context.workspacePackages, {
        workspaceGraph: workspace.graph,
      });
    }
  }

  const project = isDirectory
    ? projectForDirectory(context, fromFilePath)
    : projectForFile(context, fromFilePath);
  if (!project) {
    return emptyPlan(operation, fromFilePath, toFilePath, {
      severity: 'error',
      code: 'source-not-in-graph',
      message: `${fromFilePath} is not included by any discovered TypeScript project.`,
      path: fromFilePath,
    });
  }

  if (!isPathInside(toFilePath, dirname(project.configFilePath), true)) {
    return emptyPlan(operation, fromFilePath, toFilePath, {
      severity: 'error',
      code: 'destination-outside-project',
      message: `${toFilePath} is outside the TypeScript project rooted at ${dirname(project.configFilePath)}.`,
      path: toFilePath,
    });
  }

  const analysis = measure('analysis', options.onTiming, () =>
    analyzeProject(project.configFilePath, {
      tsconfig: project.tsconfig,
      workspacePackages: context.workspacePackages,
    }),
  );

  const plan = isDirectory
    ? planDirectoryMove(fromFilePath, toFilePath, analysis.graph, analysis.tsconfig)
    : planProjectMove(fromFilePath, toFilePath, analysis.graph, analysis.tsconfig);

  if (plan.status !== 'ready') return plan;

  const verificationDiagnostics = measure('verification', options.onTiming, () =>
    verifyMovePlan({
      moves: plan.moves,
      edits: plan.edits,
      program: analysis.program,
      moduleResolutionCache: analysis.moduleResolutionCache,
      workspacePackages: context.workspacePackages,
    }),
  );

  const verifiedPlan = mergeVerificationDiagnostics(plan, verificationDiagnostics);
  if (verifiedPlan.status !== 'ready') return verifiedPlan;

  const contents = new Map(
    [...collectSealPaths(verifiedPlan)].map((path) => [path, readFileSync(path, 'utf8')] as const),
  );
  return sealMovePlan(verifiedPlan, contents);
}

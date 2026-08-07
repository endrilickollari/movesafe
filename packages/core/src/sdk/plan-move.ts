import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { planCrossPackageMove } from '../cross-package/plan-cross-package-move.js';
import { planMove as planProjectMove } from '../planner/plan-move.js';
import { resolvePackageMembership } from '../planner/resolve-package-membership.js';
import type { MovePlan, MovePlanDiagnostic } from '../planner/types.js';
import { canonicalPath } from '../path-utils.js';
import { analyzeProject } from '../project/analyze-project.js';
import { analyzeWorkspace } from '../project/analyze-workspace.js';
import { discoverWorkspaceContext } from '../project/discover-workspace-context.js';
import type { WorkspaceContext, WorkspaceProject } from '../project/types.js';
import type { PlanMoveOptions } from './types.js';

function emptyPlan(fromFilePath: string, toFilePath: string, diagnostic: MovePlanDiagnostic): MovePlan {
  return { fromFilePath, toFilePath, edits: [], diagnostics: [diagnostic] };
}

function projectForFile(context: WorkspaceContext, filePath: string): WorkspaceProject | undefined {
  const sourcePath = canonicalPath(filePath);
  return context.projects
    .filter((project) =>
      project.tsconfig.fileNames.some((candidate) =>
        canonicalPath(candidate) === sourcePath,
      ),
    )
    .sort((a, b) => b.configFilePath.length - a.configFilePath.length)[0];
}

export function planMove(options: PlanMoveOptions): MovePlan {
  const cwd = options.cwd ?? process.cwd();
  const fromFilePath = resolve(cwd, options.from);
  const toFilePath = resolve(cwd, options.to);

  if (!existsSync(fromFilePath)) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'source-file-missing',
      message: `Cannot find file: ${fromFilePath}`,
      path: fromFilePath,
    });
  }

  if (!statSync(fromFilePath).isFile()) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'source-not-in-graph',
      message: `${fromFilePath} is not a file. Directory planning is introduced by END-42.`,
      path: fromFilePath,
    });
  }

  const context = discoverWorkspaceContext(dirname(fromFilePath));
  if (context.projects.length === 0) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'tsconfig-not-found',
      message: `Could not find a tsconfig.json above ${fromFilePath}.`,
      path: fromFilePath,
    });
  }

  const sourcePackage = resolvePackageMembership(fromFilePath, context.workspacePackages);
  const destinationPackage = resolvePackageMembership(toFilePath, context.workspacePackages);
  if (
    sourcePackage &&
    destinationPackage &&
    sourcePackage.packageName !== destinationPackage.packageName
  ) {
    const workspaceContext = discoverWorkspaceContext(context.rootDir);
    const workspace = analyzeWorkspace(workspaceContext);
    return planCrossPackageMove(fromFilePath, toFilePath, context.workspacePackages, {
      workspaceGraph: workspace.graph,
    });
  }

  const project = projectForFile(context, fromFilePath);
  if (!project) {
    return emptyPlan(fromFilePath, toFilePath, {
      severity: 'error',
      code: 'source-not-in-graph',
      message: `${fromFilePath} is not included by any discovered TypeScript project.`,
      path: fromFilePath,
    });
  }

  const analysis = analyzeProject(project.configFilePath, {
    tsconfig: project.tsconfig,
    workspacePackages: context.workspacePackages,
  });
  return planProjectMove(fromFilePath, toFilePath, analysis.graph, analysis.tsconfig);
}

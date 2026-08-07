import { join } from 'node:path';
import type { CheckFinding, ImportGraph, LoadedTsconfig } from '@movesafe/core/advanced';
import {
  applyDirectoryMove,
  applyMove,
  buildImportGraph,
  detectWorkspacePackages,
  loadTsconfig,
  planCrossPackageMove,
  planDirectoryMove,
  planProjectMove,
  runCheck,
} from '@movesafe/core/advanced';
import { classifyRepo } from './classify-repo.js';
import { cloneOrReset } from './clone-or-reset.js';
import { installDependencies } from './detect-install.js';
import { findRepoTsconfig } from './find-tsconfig.js';
import type { BenchmarkRepo } from './repos.js';
import { runTsc } from './run-tsc.js';
import { selectMoves } from './select-moves.js';

export type MoveKind = 'singleFile' | 'directory' | 'crossPackage';

export interface MoveOutcome {
  readonly kind: MoveKind;
  readonly from: string;
  readonly to: string;
  readonly applied: boolean;
  /** True when the plan itself refused (error diagnostics) before ever touching disk — a safe, expected outcome, distinct from an apply that was attempted and failed. */
  readonly refused: boolean;
  readonly diagnostics: readonly { readonly severity: 'error' | 'warning'; readonly message: string }[];
}

export interface RepoResult {
  readonly repoName: string;
  readonly category: 'plain' | 'aliased' | 'monorepo' | undefined;
  readonly moves: readonly MoveOutcome[];
  readonly checkClean: boolean | undefined;
  readonly checkFindings: readonly CheckFinding[];
  /** `tsc --noEmit` error count before any moves — many real repos have pre-existing errors unrelated to movesafe. */
  readonly tscBaselineErrorCount: number | undefined;
  readonly tscFinalErrorCount: number | undefined;
  readonly tscOutput: string | undefined;
  readonly durationMs: number;
  readonly error: string | undefined;
}

function buildGraph(tsconfigPath: string, workspacePackages: ReadonlyMap<string, string>): ImportGraph {
  return buildImportGraph(tsconfigPath, { workspacePackages: Object.fromEntries(workspacePackages) });
}

interface PrimaryProject {
  readonly tsconfigPath: string;
  readonly tsconfig: LoadedTsconfig;
  readonly graph: ImportGraph;
}

/**
 * Tries the repo's root tsconfig.json first, then each workspace package's
 * own tsconfig.json, and takes the first candidate whose graph has at least
 * one node. Needed because some repos have no root tsconfig at all (e.g. an
 * npm-workspaces repo whose real project lives one level down), and others
 * have a root tsconfig that resolves but is solution-style (`include: []`,
 * only `references`) and produces a technically-valid but empty graph.
 */
function resolvePrimaryProject(
  destDir: string,
  workspacePackages: ReadonlyMap<string, string>,
): PrimaryProject | undefined {
  const candidatePaths = [findRepoTsconfig(destDir), ...[...workspacePackages.values()].map(findRepoTsconfig)].filter(
    (path): path is string => path !== undefined,
  );

  for (const tsconfigPath of candidatePaths) {
    const tsconfig = loadTsconfig(tsconfigPath);
    const graph = buildGraph(tsconfigPath, workspacePackages);
    if (graph.nodes.length > 0) {
      return { tsconfigPath, tsconfig, graph };
    }
  }

  return undefined;
}

function applySingleFileOrCrossPackage(
  kind: 'singleFile' | 'crossPackage',
  from: string,
  to: string,
  ctx: { readonly graph: ImportGraph; readonly tsconfig: LoadedTsconfig; readonly workspacePackages: ReadonlyMap<string, string> },
): MoveOutcome {
  const plan =
    kind === 'crossPackage'
      ? planCrossPackageMove(from, to, ctx.workspacePackages)
      : planProjectMove(from, to, ctx.graph, ctx.tsconfig);

  if (plan.diagnostics.some((d) => d.severity === 'error')) {
    return { kind, from, to, applied: false, refused: true, diagnostics: plan.diagnostics };
  }

  const result = applyMove(plan);
  return {
    kind,
    from,
    to,
    applied: result.applied,
    refused: false,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
  };
}

function applyDirectory(
  from: string,
  to: string,
  ctx: { readonly graph: ImportGraph; readonly tsconfig: LoadedTsconfig },
): MoveOutcome {
  const plan = planDirectoryMove(from, to, ctx.graph, ctx.tsconfig);

  if (plan.diagnostics.some((d) => d.severity === 'error')) {
    return { kind: 'directory', from, to, applied: false, refused: true, diagnostics: plan.diagnostics };
  }

  const result = applyDirectoryMove(plan);
  return {
    kind: 'directory',
    from,
    to,
    applied: result.applied,
    refused: false,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
  };
}

function errorResult(repoName: string, startedAt: number, error: unknown): RepoResult {
  return {
    repoName,
    category: undefined,
    moves: [],
    checkClean: undefined,
    checkFindings: [],
    tscBaselineErrorCount: undefined,
    tscFinalErrorCount: undefined,
    tscOutput: undefined,
    durationMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function runRepoBenchmark(repo: BenchmarkRepo, testReposDir: string): RepoResult {
  const startedAt = Date.now();
  const destDir = join(testReposDir, repo.name);

  try {
    cloneOrReset(repo, destDir);
    installDependencies(destDir);

    const { workspacePackages } = detectWorkspacePackages(destDir);
    const primaryProject = resolvePrimaryProject(destDir, workspacePackages);
    if (!primaryProject) {
      return errorResult(
        repo.name,
        startedAt,
        `No candidate tsconfig.json (root or any workspace package) produced a non-empty project under ${destDir}.`,
      );
    }

    const baselineTsc = runTsc(destDir);

    const { tsconfigPath, tsconfig } = primaryProject;
    const category = classifyRepo(workspacePackages, tsconfig);

    let graph = primaryProject.graph;
    const selected = selectMoves(graph, {
      workspacePackages: category === 'monorepo' ? workspacePackages : undefined,
    });

    const moves: MoveOutcome[] = [];

    if (selected.singleFile) {
      moves.push(
        applySingleFileOrCrossPackage('singleFile', selected.singleFile.from, selected.singleFile.to, {
          graph,
          tsconfig,
          workspacePackages,
        }),
      );
      graph = buildGraph(tsconfigPath, workspacePackages);
    }

    if (selected.directory) {
      moves.push(applyDirectory(selected.directory.from, selected.directory.to, { graph, tsconfig }));
      graph = buildGraph(tsconfigPath, workspacePackages);
    }

    if (selected.crossPackage) {
      moves.push(
        applySingleFileOrCrossPackage('crossPackage', selected.crossPackage.from, selected.crossPackage.to, {
          graph,
          tsconfig,
          workspacePackages,
        }),
      );
      graph = buildGraph(tsconfigPath, workspacePackages);
    }

    const checkResult = runCheck(graph);
    const checkClean = !checkResult.findings.some((f) => f.severity === 'error');

    const finalTsc = runTsc(destDir);

    return {
      repoName: repo.name,
      category,
      moves,
      checkClean,
      checkFindings: checkResult.findings,
      tscBaselineErrorCount: baselineTsc.errorCount,
      tscFinalErrorCount: finalTsc.errorCount,
      tscOutput: finalTsc.output,
      durationMs: Date.now() - startedAt,
      error: undefined,
    };
  } catch (error) {
    return errorResult(repo.name, startedAt, error);
  }
}

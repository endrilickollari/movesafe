import { join } from 'node:path';
import type { CheckFinding, ImportGraph, LoadedTsconfig } from '@movesafe/core/advanced';
import {
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
  readonly diagnostics: readonly {
    readonly severity: 'error' | 'warning';
    readonly message: string;
  }[];
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
  readonly graphBuildCount: number;
  readonly graphBuildDurationMs: number;
  readonly error: string | undefined;
}

function buildGraph(
  tsconfigPath: string,
  workspacePackages: ReadonlyMap<string, string>,
  graphBuildDurations: number[],
): ImportGraph {
  const startedAt = performance.now();
  const graph = buildImportGraph(tsconfigPath, {
    workspacePackages: Object.fromEntries(workspacePackages),
  });
  graphBuildDurations.push(performance.now() - startedAt);
  return graph;
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
  graphBuildDurations: number[],
): PrimaryProject | undefined {
  const candidatePaths = [
    findRepoTsconfig(destDir),
    ...[...workspacePackages.values()].map(findRepoTsconfig),
  ].filter((path): path is string => path !== undefined);

  for (const tsconfigPath of candidatePaths) {
    const tsconfig = loadTsconfig(tsconfigPath);
    const graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
    if (graph.nodes.length > 0) {
      return { tsconfigPath, tsconfig, graph };
    }
  }

  return undefined;
}

function applyPlannedMove(
  kind: MoveKind,
  from: string,
  to: string,
  ctx: {
    readonly graph: ImportGraph;
    readonly tsconfig: LoadedTsconfig;
    readonly workspacePackages: ReadonlyMap<string, string>;
  },
): MoveOutcome {
  const plan =
    kind === 'crossPackage'
      ? planCrossPackageMove(from, to, ctx.workspacePackages)
      : kind === 'directory'
        ? planDirectoryMove(from, to, ctx.graph, ctx.tsconfig)
        : planProjectMove(from, to, ctx.graph, ctx.tsconfig);

  if (plan.status === 'blocked') {
    return { kind, from, to, applied: false, refused: true, diagnostics: plan.diagnostics };
  }

  const result = applyMove(plan);
  return {
    kind,
    from,
    to,
    applied: result.status === 'applied',
    refused: false,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
  };
}

function errorResult(
  repoName: string,
  startedAt: number,
  graphBuildDurations: readonly number[],
  error: unknown,
): RepoResult {
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
    graphBuildCount: graphBuildDurations.length,
    graphBuildDurationMs: graphBuildDurations.reduce((total, duration) => total + duration, 0),
    error: error instanceof Error ? error.message : String(error),
  };
}

export function runRepoBenchmark(repo: BenchmarkRepo, testReposDir: string): RepoResult {
  const startedAt = Date.now();
  const destDir = join(testReposDir, repo.name);
  const graphBuildDurations: number[] = [];

  try {
    cloneOrReset(repo, destDir);
    installDependencies(destDir);

    const { workspacePackages } = detectWorkspacePackages(destDir);
    const primaryProject = resolvePrimaryProject(destDir, workspacePackages, graphBuildDurations);
    if (!primaryProject) {
      return errorResult(
        repo.name,
        startedAt,
        graphBuildDurations,
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
        applyPlannedMove('singleFile', selected.singleFile.from, selected.singleFile.to, {
          graph,
          tsconfig,
          workspacePackages,
        }),
      );
      graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
    }

    if (selected.directory) {
      moves.push(
        applyPlannedMove('directory', selected.directory.from, selected.directory.to, {
          graph,
          tsconfig,
          workspacePackages,
        }),
      );
      graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
    }

    if (selected.crossPackage) {
      moves.push(
        applyPlannedMove('crossPackage', selected.crossPackage.from, selected.crossPackage.to, {
          graph,
          tsconfig,
          workspacePackages,
        }),
      );
      graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
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
      graphBuildCount: graphBuildDurations.length,
      graphBuildDurationMs: graphBuildDurations.reduce((total, duration) => total + duration, 0),
      error: undefined,
    };
  } catch (error) {
    return errorResult(repo.name, startedAt, graphBuildDurations, error);
  }
}

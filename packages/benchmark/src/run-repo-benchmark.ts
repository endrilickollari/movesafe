import { join } from 'node:path';
import type { CheckFinding, PlanMoveTiming, SdkDiagnostic } from '@movesafe/core';
import { applyMove, checkImports, planMove } from '@movesafe/core';
import type { ImportGraph, LoadedTsconfig } from '@movesafe/core/advanced';
import { buildImportGraph, detectWorkspacePackages, loadTsconfig } from '@movesafe/core/advanced';
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
  readonly analysisDurationMs: number;
  readonly verificationDurationMs: number;
}

export interface RepoResult {
  readonly repoName: string;
  readonly category: 'plain' | 'aliased' | 'monorepo' | undefined;
  readonly moves: readonly MoveOutcome[];
  readonly checkClean: boolean | undefined;
  readonly checkFindings: readonly (CheckFinding | SdkDiagnostic)[];
  /** `tsc --noEmit` error count before any moves — many real repos have pre-existing errors unrelated to movesafe. */
  readonly tscBaselineCompleted: boolean | undefined;
  readonly tscBaselineErrorCount: number | undefined;
  readonly tscFinalCompleted: boolean | undefined;
  readonly tscFinalErrorCount: number | undefined;
  readonly tscOutput: string | undefined;
  readonly durationMs: number;
  readonly graphBuildCount: number;
  readonly graphBuildDurationMs: number;
  readonly analysisDurationMs: number;
  readonly verificationDurationMs: number;
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

/**
 * Plans and applies through the public SDK's dispatcher (`planMove`), the
 * same entry point the CLI and MCP server use — so the benchmark exercises
 * what actually ships, including plan sealing, instead of calling the
 * unsealed advanced-level builders directly (which `applyMove` now refuses).
 * `kind` is only a label for `MoveOutcome`, driven by which candidate
 * `selectMoves` chose — the dispatcher redetects file/directory/cross-package
 * on its own from `from`/`to`.
 */
function applyPlannedMove(kind: MoveKind, from: string, to: string, cwd: string): MoveOutcome {
  const timings: PlanMoveTiming[] = [];
  const plan = planMove({ from, to, cwd, onTiming: (timing) => timings.push(timing) });
  const analysisDurationMs = timings
    .filter((timing) => timing.phase === 'analysis')
    .reduce((total, timing) => total + timing.durationMs, 0);
  const verificationDurationMs = timings
    .filter((timing) => timing.phase === 'verification')
    .reduce((total, timing) => total + timing.durationMs, 0);

  if (plan.status === 'blocked') {
    return {
      kind,
      from,
      to,
      applied: false,
      refused: true,
      diagnostics: plan.diagnostics,
      analysisDurationMs,
      verificationDurationMs,
    };
  }

  const result = applyMove(plan);
  return {
    kind,
    from,
    to,
    applied: result.status === 'applied',
    refused: false,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
    analysisDurationMs,
    verificationDurationMs,
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
    tscBaselineCompleted: undefined,
    tscBaselineErrorCount: undefined,
    tscFinalCompleted: undefined,
    tscFinalErrorCount: undefined,
    tscOutput: undefined,
    durationMs: Date.now() - startedAt,
    graphBuildCount: graphBuildDurations.length,
    graphBuildDurationMs: graphBuildDurations.reduce((total, duration) => total + duration, 0),
    analysisDurationMs: 0,
    verificationDurationMs: 0,
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
        applyPlannedMove('singleFile', selected.singleFile.from, selected.singleFile.to, destDir),
      );
      graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
    }

    if (selected.directory) {
      moves.push(
        applyPlannedMove('directory', selected.directory.from, selected.directory.to, destDir),
      );
      graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
    }

    if (selected.crossPackage) {
      moves.push(
        applyPlannedMove(
          'crossPackage',
          selected.crossPackage.from,
          selected.crossPackage.to,
          destDir,
        ),
      );
      graph = buildGraph(tsconfigPath, workspacePackages, graphBuildDurations);
    }

    const checkResult = checkImports({ path: destDir, cwd: destDir });
    const checkClean = checkResult.clean;

    const finalTsc = runTsc(destDir);

    return {
      repoName: repo.name,
      category,
      moves,
      checkClean,
      checkFindings: [...checkResult.findings, ...checkResult.diagnostics],
      tscBaselineCompleted: baselineTsc.completed,
      tscBaselineErrorCount: baselineTsc.errorCount,
      tscFinalCompleted: finalTsc.completed,
      tscFinalErrorCount: finalTsc.errorCount,
      tscOutput: [
        baselineTsc.completed ? '' : `Baseline tsc failed:\n${baselineTsc.output}`,
        finalTsc.output,
      ]
        .filter(Boolean)
        .join('\n'),
      durationMs: Date.now() - startedAt,
      graphBuildCount: graphBuildDurations.length,
      graphBuildDurationMs: graphBuildDurations.reduce((total, duration) => total + duration, 0),
      analysisDurationMs: moves.reduce((total, move) => total + move.analysisDurationMs, 0),
      verificationDurationMs: moves.reduce((total, move) => total + move.verificationDurationMs, 0),
      error: undefined,
    };
  } catch (error) {
    return errorResult(repo.name, startedAt, graphBuildDurations, error);
  }
}

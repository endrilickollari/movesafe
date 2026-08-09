import { describe, expect, it } from 'vitest';
import { comparePerformance } from '../src/compare-performance.js';
import type { RepoResult } from '../src/run-repo-benchmark.js';

function result(
  repoName: string,
  timings: Pick<
    RepoResult,
    'graphBuildDurationMs' | 'analysisDurationMs' | 'verificationDurationMs'
  >,
): RepoResult {
  return {
    repoName,
    category: 'plain',
    moves: [],
    checkClean: true,
    checkFindings: [],
    tscBaselineCompleted: true,
    tscBaselineErrorCount: 0,
    tscFinalCompleted: true,
    tscFinalErrorCount: 0,
    tscOutput: '',
    durationMs: 0,
    graphBuildCount: 1,
    ...timings,
    error: undefined,
  };
}

describe('comparePerformance', () => {
  it('reports an aggregate slowdown above both thresholds', () => {
    const baseline = [
      result('one', {
        graphBuildDurationMs: 1_000,
        analysisDurationMs: 1_000,
        verificationDurationMs: 1_000,
      }),
      result('two', {
        graphBuildDurationMs: 1_000,
        analysisDurationMs: 1_000,
        verificationDurationMs: 1_000,
      }),
    ];
    const current = [
      result('one', {
        graphBuildDurationMs: 1_400,
        analysisDurationMs: 1_100,
        verificationDurationMs: 1_000,
      }),
      result('two', {
        graphBuildDurationMs: 1_400,
        analysisDurationMs: 1_100,
        verificationDurationMs: 1_000,
      }),
    ];

    expect(comparePerformance(current, baseline, 0.25, 500)).toEqual([
      {
        metric: 'graphBuildDurationMs',
        baselineMs: 2_000,
        currentMs: 2_800,
        regressionFraction: 0.4,
      },
    ]);
  });

  it('ignores relative changes that are too small to be material', () => {
    const baseline = [
      result('repo', {
        graphBuildDurationMs: 100,
        analysisDurationMs: 0,
        verificationDurationMs: 0,
      }),
    ];
    const current = [
      result('repo', {
        graphBuildDurationMs: 200,
        analysisDurationMs: 10,
        verificationDurationMs: 10,
      }),
    ];

    expect(comparePerformance(current, baseline, 0.25, 500)).toEqual([]);
  });
});

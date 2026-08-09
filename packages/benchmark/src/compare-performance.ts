import type { RepoResult } from './run-repo-benchmark.js';

const METRICS = ['graphBuildDurationMs', 'analysisDurationMs', 'verificationDurationMs'] as const;

export type PerformanceMetric = (typeof METRICS)[number];

export interface PerformanceRegression {
  readonly metric: PerformanceMetric;
  readonly baselineMs: number;
  readonly currentMs: number;
  readonly regressionFraction: number;
}

export function comparePerformance(
  current: readonly RepoResult[],
  baseline: readonly RepoResult[],
  maxRegressionFraction: number,
  minimumRegressionMs: number,
): readonly PerformanceRegression[] {
  const baselineByRepo = new Map(baseline.map((result) => [result.repoName, result]));
  const pairs = current.flatMap((result) => {
    const previous = baselineByRepo.get(result.repoName);
    return previous ? [{ current: result, baseline: previous }] : [];
  });

  return METRICS.flatMap((metric) => {
    const baselineMs = pairs.reduce((total, pair) => total + pair.baseline[metric], 0);
    const currentMs = pairs.reduce((total, pair) => total + pair.current[metric], 0);
    const differenceMs = currentMs - baselineMs;

    return baselineMs > 0 &&
      differenceMs >= minimumRegressionMs &&
      currentMs > baselineMs * (1 + maxRegressionFraction)
      ? [
          {
            metric,
            baselineMs,
            currentMs,
            regressionFraction: differenceMs / baselineMs,
          },
        ]
      : [];
  });
}

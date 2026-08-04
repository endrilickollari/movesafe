import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BENCHMARK_REPOS } from './repos.js';
import type { RepoResult } from './run-repo-benchmark.js';
import { runRepoBenchmark } from './run-repo-benchmark.js';

const TEST_REPOS_DIR = fileURLToPath(new URL('../../../test_repos', import.meta.url));

function parseOnlyFilter(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--only');
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * Compares tsc's error count before and after the moves rather than requiring
 * an absolute zero — many real repos (e.g. zod) have pre-existing tsc errors
 * in test/fixture files unrelated to movesafe. A move only "fails" tsc if it
 * introduces NEW errors beyond that baseline.
 */
function tscRegressed(result: RepoResult): boolean {
  if (result.tscBaselineErrorCount === undefined || result.tscFinalErrorCount === undefined) {
    return true;
  }
  return result.tscFinalErrorCount > result.tscBaselineErrorCount;
}

/**
 * Matches END-29's own exit bar: "refusals with warnings acceptable;
 * incorrect edits are not." A move that refused at plan time (never touched
 * disk) is a safe, expected outcome — only a move that was actually
 * attempted and left the repo checked-dirty or tsc-regressed counts against
 * the repo.
 */
function repoPassed(result: RepoResult): boolean {
  if (result.error) return false;
  if (result.checkClean !== true) return false;
  if (tscRegressed(result)) return false;
  return result.moves.every((m) => m.applied || m.refused);
}

function formatResultLine(result: RepoResult): string {
  const seconds = (result.durationMs / 1000).toFixed(1);

  if (result.error) {
    return `✖ ${result.repoName}: ${result.error} — ${seconds}s`;
  }

  const applied = result.moves.filter((m) => m.applied).length;
  const refused = result.moves.filter((m) => m.refused).length;
  const status = repoPassed(result) ? '✔' : '✖';
  const checkStatus = result.checkClean ? 'check clean' : 'check found errors';
  const tscStatus = tscRegressed(result)
    ? `tsc regressed (${result.tscBaselineErrorCount} → ${result.tscFinalErrorCount} errors)`
    : `tsc no regression (${result.tscBaselineErrorCount} baseline errors)`;

  return `${status} ${result.repoName} (${result.category}): ${applied}/${result.moves.length} moves applied${refused > 0 ? ` (${refused} safely refused)` : ''}, ${checkStatus}, ${tscStatus} — ${seconds}s`;
}

function main(): void {
  const only = parseOnlyFilter(process.argv.slice(2));
  const repos = only ? BENCHMARK_REPOS.filter((r) => r.name === only) : BENCHMARK_REPOS;

  if (repos.length === 0) {
    console.error(`No repo named "${only}" in the benchmark manifest.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(TEST_REPOS_DIR, { recursive: true });

  const results: RepoResult[] = [];
  for (const repo of repos) {
    console.log(`\n— ${repo.name} —`);
    const result = runRepoBenchmark(repo, TEST_REPOS_DIR);
    results.push(result);
    console.log(formatResultLine(result));
    if (!result.checkClean && result.checkFindings.length > 0) {
      for (const finding of result.checkFindings) {
        console.log(`    ✖ ${finding.message}`);
      }
    }
    if (tscRegressed(result) && result.tscOutput) {
      console.log(result.tscOutput.trim());
    }
  }

  const passedCount = results.filter(repoPassed).length;
  console.log(`\n${passedCount}/${results.length} repos passed.`);

  process.exitCode = passedCount === results.length ? 0 : 1;
}

main();

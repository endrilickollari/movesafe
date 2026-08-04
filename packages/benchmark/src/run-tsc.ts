import { spawnSync } from 'node:child_process';

export interface TscResult {
  readonly passed: boolean;
  readonly errorCount: number;
  readonly output: string;
}

/** Runs `tsc --noEmit` in `repoDir` using that repo's own installed TypeScript (via npx). */
export function runTsc(repoDir: string): TscResult {
  const result = spawnSync('npx', ['--yes', 'tsc', '--noEmit'], {
    cwd: repoDir,
    encoding: 'utf8',
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const errorCount = (output.match(/error TS\d+:/g) ?? []).length;

  return { passed: result.status === 0, errorCount, output };
}

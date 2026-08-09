import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { commandInvocation } from './command-invocation.js';

export interface TscResult {
  readonly completed: boolean;
  readonly errorCount: number;
  readonly output: string;
}

/** Runs `tsc --noEmit` in `repoDir` using that repo's installed TypeScript. */
export function runTsc(repoDir: string): TscResult {
  const invocation = commandInvocation(join(repoDir, 'node_modules', '.bin', 'tsc'), ['--noEmit']);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repoDir,
    encoding: 'utf8',
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
  const errorCount = (output.match(/error TS\d+:/g) ?? []).length;

  return {
    completed:
      result.error === undefined &&
      typeof result.status === 'number' &&
      (result.status === 0 || errorCount > 0),
    errorCount,
    output,
  };
}

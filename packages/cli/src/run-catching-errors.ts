import { fail } from './run-result.js';
import type { RunResult } from './run-result.js';

/** Runs a command body, downgrading any thrown error to a failed `RunResult` instead of crashing the process. */
export function runCatchingErrors(run: () => RunResult): RunResult {
  try {
    return run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Unexpected error: ${message}`);
  }
}

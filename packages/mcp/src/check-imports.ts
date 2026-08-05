import { resolve } from 'node:path';
import type { CheckFinding } from '@movesafe/core';
import { runCheck } from '@movesafe/core';
import { resolveImportGraph } from './resolve-import-graph.js';

export interface CheckImportsOptions {
  readonly path: string | undefined;
  readonly cwd: string;
}

export interface CheckImportsResult {
  readonly ok: boolean;
  readonly error: string | undefined;
  readonly findings: readonly CheckFinding[];
  readonly summary: { readonly errorCount: number; readonly warningCount: number; readonly total: number };
}

const EMPTY_SUMMARY = { errorCount: 0, warningCount: 0, total: 0 };

export function checkImports(options: CheckImportsOptions): CheckImportsResult {
  const target = resolve(options.cwd, options.path ?? '.');

  const resolved = resolveImportGraph(target);
  if (!resolved) {
    return { ok: false, error: `Could not find a tsconfig.json above ${target}.`, findings: [], summary: EMPTY_SUMMARY };
  }

  const result = runCheck(resolved.graph);
  const errorCount = result.findings.filter((f) => f.severity === 'error').length;
  const warningCount = result.findings.length - errorCount;

  return {
    ok: errorCount === 0,
    error: undefined,
    findings: result.findings,
    summary: { errorCount, warningCount, total: result.findings.length },
  };
}

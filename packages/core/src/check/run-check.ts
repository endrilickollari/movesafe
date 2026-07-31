import type { ImportGraph } from '../graph/types.js';
import { checkCaseSensitivity } from './check-case-sensitivity.js';
import { checkOrphanedBarrelExports } from './check-orphaned-barrel-exports.js';
import { checkUnresolvedImports } from './check-unresolved-imports.js';
import type { CheckResult } from './types.js';

export function runCheck(graph: ImportGraph): CheckResult {
  const findings = [
    ...checkUnresolvedImports(graph),
    ...checkOrphanedBarrelExports(graph),
    ...checkCaseSensitivity(graph),
  ];

  findings.sort((a, b) => {
    const pathCompare = (a.path ?? '').localeCompare(b.path ?? '');
    return pathCompare !== 0 ? pathCompare : a.code.localeCompare(b.code);
  });

  return { findings };
}

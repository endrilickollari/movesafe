export type CheckFindingCode = 'unresolved-import' | 'orphaned-barrel-export' | 'case-sensitivity-mismatch';

export interface CheckFinding {
  readonly severity: 'error' | 'warning';
  readonly code: CheckFindingCode;
  readonly message: string;
  readonly path: string | undefined;
}

export interface CheckResult {
  readonly findings: readonly CheckFinding[];
}

export type ApplyDiagnosticCode =
  | 'plan-has-errors'
  | 'invalid-plan'
  | 'source-file-missing'
  | 'destination-already-exists'
  | 'stale-content'
  | 'transaction-failed'
  | 'cleanup-failed'
  | 'non-source-files-left-behind'
  | 'backup-cleanup-failed';

export interface ApplyDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: ApplyDiagnosticCode;
  readonly message: string;
  readonly path: string | undefined;
}

/**
 * `applied`: the plan fully landed. `rejected`: nothing was mutated —
 * either preflight failed, or a mutation-phase failure was fully rolled
 * back, leaving disk exactly as it was. `partial`: rollback or post-commit
 * cleanup could not finish every operation; `manualRecoveryPaths` names
 * what a human needs to check by hand.
 */
export type ApplyStatus = 'applied' | 'rejected' | 'partial';

export interface ApplyResult {
  readonly status: ApplyStatus;
  readonly diagnostics: readonly ApplyDiagnostic[];
  /** Non-empty only when `status === 'partial'`. */
  readonly manualRecoveryPaths: readonly string[];
}

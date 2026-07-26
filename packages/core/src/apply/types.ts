export type ApplyDiagnosticCode =
  | 'plan-has-errors'
  | 'source-file-missing'
  | 'destination-already-exists'
  | 'stale-content'
  | 'rename-failed';

export interface ApplyDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: ApplyDiagnosticCode;
  readonly message: string;
  readonly path: string | undefined;
}

export interface ApplyResult {
  readonly applied: boolean;
  readonly diagnostics: readonly ApplyDiagnostic[];
}

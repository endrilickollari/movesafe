export type FindingSeverity = 'error' | 'warning';

export interface Finding {
  readonly severity: FindingSeverity;
  readonly code: string;
  readonly message: string;
  readonly path: string | undefined;
}

export type ReportFormat = 'tty' | 'json' | 'md';

export interface ReportOptions {
  readonly color?: boolean;
}

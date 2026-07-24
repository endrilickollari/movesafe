import type { SourceOffset } from '../ts-utils/types.js';

export interface Edit {
  /** Absolute path of the file this edit applies to. */
  readonly file: string;
  /** Range to replace, in the coordinate space of `file`'s current (pre-move) source text. */
  readonly span: SourceOffset;
  readonly oldText: string;
  readonly newText: string;
  readonly reason: string;
}

export type MovePlanDiagnosticCode =
  | 'source-not-in-graph'
  | 'source-equals-destination'
  | 'destination-collides-with-existing-file'
  | 'unrecomputable-inbound-specifier';

export interface MovePlanDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: MovePlanDiagnosticCode;
  readonly message: string;
  readonly path: string | undefined;
}

export interface MovePlan {
  readonly fromFilePath: string;
  readonly toFilePath: string;
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly MovePlanDiagnostic[];
}

export interface CollectedEdits {
  readonly edits: Edit[];
  readonly diagnostics: MovePlanDiagnostic[];
}

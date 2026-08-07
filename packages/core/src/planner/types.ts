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
  | 'source-file-missing'
  | 'tsconfig-not-found'
  | 'source-not-in-graph'
  | 'source-equals-destination'
  | 'destination-collides-with-existing-file'
  | 'unrecomputable-inbound-specifier'
  | 'barrel-reexport-relocation-candidate'
  | 'source-directory-empty'
  | 'destination-under-source'
  | 'destination-is-a-file'
  | 'unrecomputable-specifier'
  | 'file-not-in-workspace-package'
  | 'not-a-cross-package-move'
  | 'package-missing-tsconfig'
  | 'circular-dependency-warning'
  | 'third-party-references-not-rewritten';

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

export interface FileMove {
  readonly fromFilePath: string;
  readonly toFilePath: string;
}

export interface DirectoryMovePlan {
  readonly fromDirPath: string;
  readonly toDirPath: string;
  readonly moves: readonly FileMove[];
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly MovePlanDiagnostic[];
}

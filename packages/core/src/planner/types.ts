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
  | 'cross-package-directory-unsupported'
  | 'destination-outside-project'
  | 'missing-workspace-dependency'
  | 'circular-dependency-warning'
  | 'third-party-references-not-rewritten'
  | 'broken-import-after-move';

export interface MovePlanDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: MovePlanDiagnosticCode;
  readonly message: string;
  readonly path: string | undefined;
}

export interface CollectedEdits {
  readonly edits: Edit[];
  readonly diagnostics: MovePlanDiagnostic[];
}

export interface FileMove {
  readonly fromFilePath: string;
  readonly toFilePath: string;
}

/** Schema version of the `MovePlan` shape itself, bumped on breaking changes so long-lived consumers (CLI/MCP/SDK clients) can detect drift. */
export const MOVE_PLAN_SCHEMA_VERSION = 2;

/**
 * `ready` only once every known affected import has been proven to resolve
 * in the simulated post-move state (see `verify/verify-move-plan.ts`);
 * `blocked` otherwise. Never guess — a blocked plan must not be applied.
 */
export type MovePlanStatus = 'ready' | 'blocked';

export type MovePlanOperation = 'file' | 'directory';

/** `project`: source and destination live in the same TypeScript project. `workspace`: a cross-package move, verified against the wider workspace. */
export type MovePlanScope = 'project' | 'workspace';

export type MovePlanPrecondition =
  | { readonly kind: 'source-directory'; readonly path: string }
  | { readonly kind: 'source-exists'; readonly path: string }
  | { readonly kind: 'destination-absent'; readonly path: string }
  | {
      readonly kind: 'edit-anchor';
      readonly file: string;
      readonly span: SourceOffset;
      readonly oldText: string;
    };

export interface MovePlan {
  readonly schemaVersion: typeof MOVE_PLAN_SCHEMA_VERSION;
  readonly status: MovePlanStatus;
  readonly operation: MovePlanOperation;
  readonly scope: MovePlanScope;
  /** One entry for a file or cross-package move; one per relocated file for a directory move. */
  readonly moves: readonly FileMove[];
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly MovePlanDiagnostic[];
  readonly preconditions: readonly MovePlanPrecondition[];
  /** Content-addressed identity of the plan's executable inputs, for traceability and drift detection — not a security boundary. */
  readonly planHash: string;
}

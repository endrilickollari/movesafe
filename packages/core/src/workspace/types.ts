export type WorkspacePackageManager = 'pnpm' | 'yarn' | 'npm';

export type WorkspaceDiagnosticCode =
  | 'no-workspace-config-found'
  | 'multiple-workspace-configs-found'
  | 'ambiguous-package-manager'
  | 'unparsable-pnpm-workspace-yaml'
  | 'unsupported-negation-pattern'
  | 'glob-matched-zero-packages'
  | 'unreadable-package-json'
  | 'package-json-missing-name'
  | 'duplicate-package-name';

export interface WorkspaceDiagnostic {
  readonly severity: 'warning' | 'info';
  readonly code: WorkspaceDiagnosticCode;
  readonly message: string;
  readonly path: string | undefined;
}

export interface DetectWorkspacePackagesResult {
  readonly rootDir: string;
  readonly packageManager: WorkspacePackageManager | undefined;
  readonly hasTurborepo: boolean;
  readonly patterns: readonly string[];
  readonly workspacePackages: ReadonlyMap<string, string>;
  readonly diagnostics: readonly WorkspaceDiagnostic[];
}

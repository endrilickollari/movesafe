import type * as ts from 'typescript';

export type TsconfigDiagnosticSeverity = 'error' | 'warning' | 'suggestion' | 'message';

export interface TsconfigDiagnosticPosition {
  readonly start: number;
  readonly end: number;
}

export interface TsconfigDiagnostic {
  readonly severity: TsconfigDiagnosticSeverity;
  readonly code: number;
  readonly message: string;
  readonly configFilePath: string | undefined;
  readonly position: TsconfigDiagnosticPosition | undefined;
}

export interface TsconfigPaths {
  /** Absolute, as resolved by the TS API. */
  readonly baseUrl: string | undefined;
  /** Raw patterns, unresolved. */
  readonly paths: Readonly<Record<string, readonly string[]>> | undefined;
  /** Absolute dir the `paths` patterns are relative to (baseUrl, or the paths-without-baseUrl fallback). */
  readonly pathsBaseDir: string | undefined;
}

export interface TsconfigReference {
  /** Absolute, normalized by the TS API. */
  readonly path: string;
  /** As written in the JSON, before normalization. */
  readonly originalPath: string | undefined;
}

export interface LoadTsconfigOptions {
  readonly optionsToExtend?: ts.CompilerOptions;
  readonly extendedConfigCache?: Map<string, ts.ExtendedConfigCacheEntry>;
}

export interface LoadedTsconfig {
  readonly configFilePath: string;
  readonly compilerOptions: ts.CompilerOptions;
  readonly paths: TsconfigPaths;
  readonly references: readonly TsconfigReference[];
  readonly fileNames: readonly string[];
  readonly diagnostics: readonly TsconfigDiagnostic[];
}

export type ResolvedSpecifierKind = 'resolved' | 'external' | 'unresolved';

export interface ResolveSpecifierWarning {
  readonly kind: 'unresolved' | 'externalWithoutPackageId';
  readonly specifier: string;
  readonly containingFile: string;
  readonly message: string;
}

export interface ResolvedPackageId {
  readonly name: string;
  readonly subModuleName: string;
  readonly version: string;
}

export interface ResolvedSpecifierResolved {
  readonly kind: 'resolved';
  readonly specifier: string;
  readonly containingFile: string;
  /** Absolute, as resolved by the TS API. May point into a package's `dist/`
   *  for workspace packages — remapping to source is a later concern. */
  readonly resolvedFileName: string;
  readonly isWorkspacePackage: boolean;
  readonly packageId: ResolvedPackageId | undefined;
}

export interface ResolvedSpecifierExternal {
  readonly kind: 'external';
  readonly specifier: string;
  readonly containingFile: string;
  readonly packageName: string | undefined;
}

export interface ResolvedSpecifierUnresolved {
  readonly kind: 'unresolved';
  readonly specifier: string;
  readonly containingFile: string;
}

export type ResolvedSpecifier =
  | ResolvedSpecifierResolved
  | ResolvedSpecifierExternal
  | ResolvedSpecifierUnresolved;

export interface ResolveSpecifierResult {
  readonly result: ResolvedSpecifier;
  readonly warnings: readonly ResolveSpecifierWarning[];
}

export interface ResolveSpecifierOptions {
  /**
   * Known workspace package roots, name -> absolute package directory.
   * Omitted/empty until a workspace-detection module supplies it; every
   * `isExternalLibraryImport` result then classifies as `'external'`.
   */
  readonly workspacePackages?: ReadonlyMap<string, string>;
}

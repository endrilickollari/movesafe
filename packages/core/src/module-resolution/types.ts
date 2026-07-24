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

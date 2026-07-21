import type { ImportFormKind } from '../scanner/types.js';
import type { ScanWarning } from '../scanner/types.js';
import type { ResolveSpecifierWarning, TsconfigDiagnostic } from '../resolver/types.js';
import type { SourceOffset } from '../ts-utils/types.js';

export type GraphEdgeTargetKind =
  | 'inProject'
  | 'inProjectNonSourceFile'
  | 'external'
  | 'unresolved'
  | 'outOfProject';

export interface GraphEdgeTargetInProject {
  readonly kind: 'inProject';
  /** Absolute; equals some node's filePath. */
  readonly filePath: string;
}

export interface GraphEdgeTargetInProjectNonSourceFile {
  readonly kind: 'inProjectNonSourceFile';
  /** Absolute; a file in the project's fileNames that isn't a graph node (e.g. .json, .d.ts). */
  readonly filePath: string;
}

export interface GraphEdgeTargetExternal {
  readonly kind: 'external';
  readonly packageName: string | undefined;
}

export interface GraphEdgeTargetUnresolved {
  readonly kind: 'unresolved';
}

export interface GraphEdgeTargetPackageId {
  readonly name: string;
  readonly subModuleName: string;
  readonly version: string;
}

export interface GraphEdgeTargetOutOfProject {
  readonly kind: 'outOfProject';
  /** Absolute; outside this project's fileNames (a different project's file). */
  readonly resolvedFileName: string;
  readonly isWorkspacePackage: boolean;
  readonly packageId: GraphEdgeTargetPackageId | undefined;
}

export type GraphEdgeTarget =
  | GraphEdgeTargetInProject
  | GraphEdgeTargetInProjectNonSourceFile
  | GraphEdgeTargetExternal
  | GraphEdgeTargetUnresolved
  | GraphEdgeTargetOutOfProject;

export interface ImportGraphEdge {
  /** Absolute; equals some node's filePath. */
  readonly fromFilePath: string;
  readonly specifier: string;
  readonly formKind: ImportFormKind;
  readonly isTypeOnly: boolean;
  readonly quote: '"' | "'" | '`';
  readonly specifierOffset: SourceOffset;
  readonly literalOffset: SourceOffset;
  readonly statementOffset: SourceOffset;
  readonly target: GraphEdgeTarget;
}

export interface ImportGraphNode {
  readonly filePath: string;
}

export type GraphWarning =
  | { readonly source: 'scanner'; readonly filePath: string; readonly warning: ScanWarning }
  | { readonly source: 'resolver'; readonly warning: ResolveSpecifierWarning }
  | { readonly source: 'tsconfig'; readonly diagnostic: TsconfigDiagnostic };

export interface BuildImportGraphOptions {
  /** Known workspace package roots, name -> absolute package directory. */
  readonly workspacePackages?: Readonly<Record<string, string>>;
}

export interface ImportGraph {
  readonly configFilePath: string;
  readonly nodes: readonly ImportGraphNode[];
  readonly edges: readonly ImportGraphEdge[];
  readonly warnings: readonly GraphWarning[];
}

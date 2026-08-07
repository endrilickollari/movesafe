import type * as ts from 'typescript';
import type { ImportGraph, ImportGraphEdge } from '../graph/types.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import type {
  DetectWorkspacePackagesResult,
  WorkspaceDiagnostic,
} from '../workspace/types.js';

export interface WorkspaceProject {
  readonly configFilePath: string;
  readonly tsconfig: LoadedTsconfig;
}

export interface WorkspaceContextDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: 'no-tsconfig-found' | 'referenced-tsconfig-missing';
  readonly message: string;
  readonly path: string | undefined;
}

export interface WorkspaceContext {
  readonly rootDir: string;
  readonly workspace: DetectWorkspacePackagesResult | undefined;
  readonly workspacePackages: ReadonlyMap<string, string>;
  readonly projects: readonly WorkspaceProject[];
  readonly diagnostics: readonly (WorkspaceDiagnostic | WorkspaceContextDiagnostic)[];
}

export interface ImportGraphIndex {
  readonly nodePaths: ReadonlySet<string>;
  readonly inboundByTarget: ReadonlyMap<string, readonly ImportGraphEdge[]>;
  readonly outboundBySource: ReadonlyMap<string, readonly ImportGraphEdge[]>;
}

export interface ProjectAnalysis {
  readonly tsconfig: LoadedTsconfig;
  readonly program: ts.Program;
  readonly sourceFiles: ReadonlyMap<string, ts.SourceFile>;
  readonly moduleResolutionCache: ts.ModuleResolutionCache;
  readonly graph: ImportGraph;
  readonly index: ImportGraphIndex;
}

export interface WorkspaceAnalysis {
  readonly context: WorkspaceContext;
  readonly projects: readonly ProjectAnalysis[];
  readonly graph: ImportGraph;
  readonly index: ImportGraphIndex;
}

export type { ResolvedModuleClassification } from './classify-resolution.js';
export type {
  LoadedTsconfig,
  LoadTsconfigOptions,
  ResolvedPackageId,
  ResolvedSpecifier,
  ResolvedSpecifierExternal,
  ResolvedSpecifierKind,
  ResolvedSpecifierResolved,
  ResolvedSpecifierUnresolved,
  ResolveSpecifierOptions,
  ResolveSpecifierResult,
  ResolveSpecifierWarning,
  TsconfigDiagnostic,
  TsconfigDiagnosticPosition,
  TsconfigDiagnosticSeverity,
  TsconfigPaths,
  TsconfigReference,
} from './types.js';
export { classifyResolvedModule } from './classify-resolution.js';
export { loadTsconfig } from './load-tsconfig.js';
export { resolveSpecifier } from './resolve-specifier.js';

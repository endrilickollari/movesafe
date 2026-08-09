import { dirname } from 'node:path';
import * as ts from 'typescript';
import { collectModuleResolutionDiagnostics } from '../module-resolution/diagnostics.js';
import { resolveSpecifier } from '../module-resolution/index.js';
import { toFileSystemPath } from '../path-utils.js';
import { scanFile, scanSourceFile } from '../scanner/index.js';
import { loadTsconfig } from '../tsconfig/index.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { classifyEdgeTarget } from './classify-edge-target.js';
import { discoverProjectFiles } from './discover-project-files.js';
import type {
  BuildImportGraphOptions,
  GraphWarning,
  ImportGraph,
  ImportGraphEdge,
} from './types.js';

export function buildImportGraph(
  configFilePath: string,
  options: BuildImportGraphOptions = {},
): ImportGraph {
  const tsconfig = loadTsconfig(configFilePath);
  return buildImportGraphFromTsconfig(tsconfig, options);
}

export interface BuildImportGraphRuntime {
  readonly program?: ts.Program;
  readonly moduleResolutionHost?: ts.ModuleResolutionHost;
  readonly moduleResolutionCache?: ts.ModuleResolutionCache;
  readonly getModuleResolutionDiagnostics?: (sourceFile: ts.SourceFile) => readonly ts.Diagnostic[];
}

export function createBuildImportGraphRuntime(
  tsconfig: LoadedTsconfig,
): Required<BuildImportGraphRuntime> {
  const canonicalFileName = ts.sys.useCaseSensitiveFileNames
    ? (fileName: string): string => fileName
    : (fileName: string): string => fileName.toLowerCase();
  const moduleResolutionCache = ts.createModuleResolutionCache(
    dirname(tsconfig.configFilePath),
    canonicalFileName,
    tsconfig.compilerOptions,
  );
  const moduleResolutionHost = ts.createCompilerHost(tsconfig.compilerOptions, true);
  const getSourceFile = moduleResolutionHost.getSourceFile.bind(moduleResolutionHost);
  moduleResolutionHost.getSourceFile = (fileName, ...args) =>
    getSourceFile(toFileSystemPath(fileName), ...args);

  moduleResolutionHost.resolveModuleNameLiterals = (
    moduleLiterals,
    containingFile,
    redirectedReference,
    compilerOptions,
    containingSourceFile,
  ) =>
    moduleLiterals.map((literal) =>
      ts.resolveModuleName(
        literal.text,
        containingFile,
        compilerOptions,
        moduleResolutionHost,
        moduleResolutionCache,
        redirectedReference,
        ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions),
      ),
    );

  const program = ts.createProgram({
    rootNames: tsconfig.fileNames,
    options: tsconfig.compilerOptions,
    projectReferences: tsconfig.references.map((reference) => ({ path: reference.path })),
    host: moduleResolutionHost,
  });
  const moduleResolutionDiagnostics = new Map<ts.SourceFile, readonly ts.Diagnostic[]>();
  const getModuleResolutionDiagnostics = (sourceFile: ts.SourceFile): readonly ts.Diagnostic[] => {
    const cached = moduleResolutionDiagnostics.get(sourceFile);
    if (cached) return cached;
    const diagnostics = collectModuleResolutionDiagnostics(program, [sourceFile]);
    moduleResolutionDiagnostics.set(sourceFile, diagnostics);
    return diagnostics;
  };

  return {
    program,
    moduleResolutionHost,
    moduleResolutionCache,
    getModuleResolutionDiagnostics,
  };
}

export function buildImportGraphFromTsconfig(
  tsconfig: LoadedTsconfig,
  options: BuildImportGraphOptions = {},
  runtime: BuildImportGraphRuntime = {},
): ImportGraph {
  const activeRuntime: BuildImportGraphRuntime & { readonly program: ts.Program } = runtime.program
    ? { ...runtime, program: runtime.program }
    : createBuildImportGraphRuntime(tsconfig);
  const diagnosticsBySourceFile = new Map<ts.SourceFile, readonly ts.Diagnostic[]>();
  const getModuleResolutionDiagnostics = (sourceFile: ts.SourceFile): readonly ts.Diagnostic[] => {
    const cached = diagnosticsBySourceFile.get(sourceFile);
    if (cached) return cached;
    const diagnostics = activeRuntime.getModuleResolutionDiagnostics
      ? activeRuntime.getModuleResolutionDiagnostics(sourceFile)
      : collectModuleResolutionDiagnostics(activeRuntime.program, [sourceFile]);
    diagnosticsBySourceFile.set(sourceFile, diagnostics);
    return diagnostics;
  };
  const warnings: GraphWarning[] = tsconfig.diagnostics.map((diagnostic) => ({
    source: 'tsconfig',
    diagnostic,
  }));

  const { sourceFiles, nonSourceFiles } = discoverProjectFiles(tsconfig);
  const sourceFileSet = new Set(sourceFiles);
  const nonSourceFileSet = new Set(nonSourceFiles);

  const workspacePackages = options.workspacePackages
    ? new Map(Object.entries(options.workspacePackages))
    : undefined;

  const nodes = sourceFiles.map((filePath) => ({ filePath }));
  const edges: ImportGraphEdge[] = [];

  for (const filePath of sourceFiles) {
    const sourceFile = activeRuntime.program.getSourceFile(filePath);
    const scanResult = sourceFile ? scanSourceFile(sourceFile) : scanFile(filePath);
    for (const warning of scanResult.warnings) {
      warnings.push({ source: 'scanner', filePath, warning });
    }

    for (const specifierRecord of scanResult.specifiers) {
      const { result, warnings: resolveWarnings } = resolveSpecifier(
        specifierRecord.moduleText,
        filePath,
        activeRuntime.program,
        {
          workspacePackages,
          moduleResolutionHost: activeRuntime.moduleResolutionHost,
          moduleResolutionCache: activeRuntime.moduleResolutionCache,
          semanticResolution: {
            diagnostics: () => (sourceFile ? getModuleResolutionDiagnostics(sourceFile) : []),
            formKind: specifierRecord.formKind,
            literalOffset: specifierRecord.literalOffset,
          },
        },
      );
      for (const warning of resolveWarnings) {
        warnings.push({ source: 'resolver', warning });
      }

      edges.push({
        fromFilePath: filePath,
        specifier: specifierRecord.moduleText,
        formKind: specifierRecord.formKind,
        isTypeOnly: specifierRecord.isTypeOnly,
        quote: specifierRecord.quote,
        specifierOffset: specifierRecord.specifierOffset,
        literalOffset: specifierRecord.literalOffset,
        statementOffset: specifierRecord.statementOffset,
        target: classifyEdgeTarget(result, sourceFileSet, nonSourceFileSet),
      });
    }
  }

  return { configFilePath: tsconfig.configFilePath, nodes, edges, warnings };
}

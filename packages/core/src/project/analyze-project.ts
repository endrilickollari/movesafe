import { dirname } from 'node:path';
import * as ts from 'typescript';
import { buildImportGraphFromTsconfig } from '../graph/build-import-graph.js';
import { loadTsconfig } from '../tsconfig/load-tsconfig.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { buildImportGraphIndex } from './build-import-graph-index.js';
import type { ProjectAnalysis } from './types.js';

export interface AnalyzeProjectOptions {
  readonly workspacePackages?: ReadonlyMap<string, string>;
  readonly tsconfig?: LoadedTsconfig;
}

export function analyzeProject(
  configFilePath: string,
  options: AnalyzeProjectOptions = {},
): ProjectAnalysis {
  const tsconfig = options.tsconfig ?? loadTsconfig(configFilePath);
  const canonicalFileName = ts.sys.useCaseSensitiveFileNames
    ? (fileName: string): string => fileName
    : (fileName: string): string => fileName.toLowerCase();
  const moduleResolutionCache = ts.createModuleResolutionCache(
    dirname(configFilePath),
    canonicalFileName,
    tsconfig.compilerOptions,
  );
  const host = ts.createCompilerHost(tsconfig.compilerOptions, true);

  host.resolveModuleNameLiterals = (
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
        host,
        moduleResolutionCache,
        redirectedReference,
        ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions),
      ),
    );

  const program = ts.createProgram({
    rootNames: tsconfig.fileNames,
    options: tsconfig.compilerOptions,
    projectReferences: tsconfig.references.map((reference) => ({ path: reference.path })),
    host,
  });
  const graph = buildImportGraphFromTsconfig(
    tsconfig,
    {
      workspacePackages: options.workspacePackages
        ? Object.fromEntries(options.workspacePackages)
        : undefined,
    },
    { program, moduleResolutionHost: host, moduleResolutionCache },
  );
  const sourceFiles = new Map(
    tsconfig.fileNames.flatMap((filePath) => {
      const sourceFile = program.getSourceFile(filePath);
      return sourceFile ? [[filePath, sourceFile] as const] : [];
    }),
  );

  return {
    tsconfig,
    program,
    sourceFiles,
    moduleResolutionCache,
    graph,
    index: buildImportGraphIndex(graph),
  };
}

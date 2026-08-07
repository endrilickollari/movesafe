import {
  buildImportGraphFromTsconfig,
  createBuildImportGraphRuntime,
} from '../graph/build-import-graph.js';
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
  const runtime = createBuildImportGraphRuntime(tsconfig);
  const graph = buildImportGraphFromTsconfig(
    tsconfig,
    {
      workspacePackages: options.workspacePackages
        ? Object.fromEntries(options.workspacePackages)
        : undefined,
    },
    runtime,
  );
  const sourceFiles = new Map(
    tsconfig.fileNames.flatMap((filePath) => {
      const sourceFile = runtime.program.getSourceFile(filePath);
      return sourceFile ? [[filePath, sourceFile] as const] : [];
    }),
  );

  return {
    tsconfig,
    program: runtime.program,
    sourceFiles,
    moduleResolutionCache: runtime.moduleResolutionCache,
    getModuleResolutionDiagnostics: () =>
      [...sourceFiles.values()].flatMap(runtime.getModuleResolutionDiagnostics),
    graph,
    index: buildImportGraphIndex(graph),
  };
}

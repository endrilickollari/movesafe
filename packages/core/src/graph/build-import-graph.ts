import type * as ts from 'typescript';
import { resolveSpecifier } from '../module-resolution/index.js';
import { scanFile, scanSourceFile } from '../scanner/index.js';
import { loadTsconfig } from '../tsconfig/index.js';
import type { LoadedTsconfig } from '../tsconfig/types.js';
import { classifyEdgeTarget } from './classify-edge-target.js';
import { discoverProjectFiles } from './discover-project-files.js';
import type { BuildImportGraphOptions, GraphWarning, ImportGraph, ImportGraphEdge } from './types.js';

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
}

export function buildImportGraphFromTsconfig(
  tsconfig: LoadedTsconfig,
  options: BuildImportGraphOptions = {},
  runtime: BuildImportGraphRuntime = {},
): ImportGraph {
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
    const sourceFile = runtime.program?.getSourceFile(filePath);
    const scanResult = sourceFile ? scanSourceFile(sourceFile) : scanFile(filePath);
    for (const warning of scanResult.warnings) {
      warnings.push({ source: 'scanner', filePath, warning });
    }

    for (const specifierRecord of scanResult.specifiers) {
      const { result, warnings: resolveWarnings } = resolveSpecifier(
        specifierRecord.moduleText,
        filePath,
        tsconfig,
        {
          workspacePackages,
          moduleResolutionHost: runtime.moduleResolutionHost,
          moduleResolutionCache: runtime.moduleResolutionCache,
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

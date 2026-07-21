import { loadTsconfig, resolveSpecifier } from '../resolver/index.js';
import { scanFile } from '../scanner/index.js';
import { classifyEdgeTarget } from './classify-edge-target.js';
import { discoverProjectFiles } from './discover-project-files.js';
import type { BuildImportGraphOptions, GraphWarning, ImportGraph, ImportGraphEdge } from './types.js';

export function buildImportGraph(
  configFilePath: string,
  options: BuildImportGraphOptions = {},
): ImportGraph {
  const tsconfig = loadTsconfig(configFilePath);
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
    const scanResult = scanFile(filePath);
    for (const warning of scanResult.warnings) {
      warnings.push({ source: 'scanner', filePath, warning });
    }

    for (const specifierRecord of scanResult.specifiers) {
      const { result, warnings: resolveWarnings } = resolveSpecifier(
        specifierRecord.moduleText,
        filePath,
        tsconfig,
        { workspacePackages },
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

  return { configFilePath, nodes, edges, warnings };
}

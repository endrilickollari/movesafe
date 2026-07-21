import * as ts from 'typescript';
import { toTsconfigDiagnostic } from './diagnostics.js';
import { extractPaths } from './extract-paths.js';
import { extractReferences } from './extract-references.js';
import { createParseConfigFileHost } from './host.js';
import type { LoadedTsconfig, LoadTsconfigOptions } from './types.js';

export function loadTsconfig(
  configFilePath: string,
  options: LoadTsconfigOptions = {},
): LoadedTsconfig {
  let unrecoverable: ts.Diagnostic | undefined;
  const host = createParseConfigFileHost((diagnostic) => {
    unrecoverable = diagnostic;
  });

  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFilePath,
    options.optionsToExtend,
    host,
    options.extendedConfigCache,
  );

  if (parsed === undefined) {
    return {
      configFilePath,
      compilerOptions: {},
      paths: { baseUrl: undefined, paths: undefined, pathsBaseDir: undefined },
      references: [],
      fileNames: [],
      diagnostics: unrecoverable ? [toTsconfigDiagnostic(unrecoverable)] : [],
    };
  }

  return {
    configFilePath,
    compilerOptions: parsed.options,
    paths: extractPaths(parsed.options),
    references: extractReferences(parsed.projectReferences),
    fileNames: parsed.fileNames,
    diagnostics: parsed.errors.map(toTsconfigDiagnostic),
  };
}

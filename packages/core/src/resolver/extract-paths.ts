import type * as ts from 'typescript';
import type { TsconfigPaths } from './types.js';

export function extractPaths(options: ts.CompilerOptions): TsconfigPaths {
  const pathsBasePath = typeof options.pathsBasePath === 'string' ? options.pathsBasePath : undefined;
  return {
    baseUrl: options.baseUrl,
    paths: options.paths,
    pathsBaseDir: options.baseUrl ?? pathsBasePath,
  };
}

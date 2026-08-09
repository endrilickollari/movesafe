import type * as ts from 'typescript';
import { toFileSystemPath } from '../path-utils.js';
import type { TsconfigPaths } from './types.js';

export function extractPaths(options: ts.CompilerOptions): TsconfigPaths {
  const pathsBasePath = typeof options.pathsBasePath === 'string' ? options.pathsBasePath : undefined;
  const pathsBaseDir = options.baseUrl ?? pathsBasePath;
  return {
    baseUrl: options.baseUrl ? toFileSystemPath(options.baseUrl) : undefined,
    paths: options.paths,
    pathsBaseDir: pathsBaseDir ? toFileSystemPath(pathsBaseDir) : undefined,
  };
}

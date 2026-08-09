import { isAbsolute, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

export function canonicalPath(filePath: string): string {
  const absolutePath = resolve(filePath);
  return ts.sys.useCaseSensitiveFileNames ? absolutePath : absolutePath.toLowerCase();
}

export function isPathInside(filePath: string, directory: string, includeDirectory = false): boolean {
  const offset = relative(directory, filePath);
  if (offset === '') return includeDirectory;
  return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

export function toModulePath(filePath: string, pathSeparator = sep): string {
  return pathSeparator === '/' ? filePath : filePath.replaceAll(pathSeparator, '/');
}

export function toFileSystemPath(filePath: string, pathSeparator = sep): string {
  return pathSeparator === '/' ? filePath : filePath.replaceAll('/', pathSeparator);
}

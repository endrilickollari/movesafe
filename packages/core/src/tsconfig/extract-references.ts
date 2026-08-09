import type * as ts from 'typescript';
import { toFileSystemPath } from '../path-utils.js';
import type { TsconfigReference } from './types.js';

export function extractReferences(
  refs: readonly ts.ProjectReference[] | undefined,
): TsconfigReference[] {
  if (!refs) return [];
  return refs.map((ref) => ({
    path: toFileSystemPath(ref.path),
    originalPath: ref.originalPath,
  }));
}

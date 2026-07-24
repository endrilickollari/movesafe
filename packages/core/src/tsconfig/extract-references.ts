import type * as ts from 'typescript';
import type { TsconfigReference } from './types.js';

export function extractReferences(
  refs: readonly ts.ProjectReference[] | undefined,
): TsconfigReference[] {
  if (!refs) return [];
  return refs.map((ref) => ({ path: ref.path, originalPath: ref.originalPath }));
}

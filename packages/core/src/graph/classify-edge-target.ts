import type { ResolvedSpecifier } from '../resolver/types.js';
import type { GraphEdgeTarget } from './types.js';

export function classifyEdgeTarget(
  resolved: ResolvedSpecifier,
  sourceFileSet: ReadonlySet<string>,
  nonSourceFileSet: ReadonlySet<string>,
): GraphEdgeTarget {
  if (resolved.kind === 'external') {
    return { kind: 'external', packageName: resolved.packageName };
  }

  if (resolved.kind === 'unresolved') {
    return { kind: 'unresolved' };
  }

  if (sourceFileSet.has(resolved.resolvedFileName)) {
    return { kind: 'inProject', filePath: resolved.resolvedFileName };
  }

  if (nonSourceFileSet.has(resolved.resolvedFileName)) {
    return { kind: 'inProjectNonSourceFile', filePath: resolved.resolvedFileName };
  }

  return {
    kind: 'outOfProject',
    resolvedFileName: resolved.resolvedFileName,
    isWorkspacePackage: resolved.isWorkspacePackage,
    packageId: resolved.packageId,
  };
}

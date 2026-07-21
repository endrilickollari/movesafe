import * as ts from 'typescript';
import type { WorkspaceDiagnostic } from './types.js';

export interface ExpandedWorkspaceGlobs {
  readonly packageJsonPaths: readonly string[];
  readonly diagnostics: readonly WorkspaceDiagnostic[];
}

export function expandWorkspaceGlobs(
  rootDir: string,
  patterns: readonly string[],
): ExpandedWorkspaceGlobs {
  const packageJsonPaths = new Set<string>();
  const diagnostics: WorkspaceDiagnostic[] = [];

  for (const pattern of patterns) {
    const include = `${pattern.endsWith('/') ? pattern.slice(0, -1) : pattern}/package.json`;
    const matches = ts.sys.readDirectory(rootDir, undefined, ['**/node_modules/**'], [include]);

    if (matches.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'glob-matched-zero-packages',
        message: `Workspace pattern '${pattern}' matched no package.json files.`,
        path: pattern,
      });
      continue;
    }

    for (const match of matches) packageJsonPaths.add(match);
  }

  return { packageJsonPaths: [...packageJsonPaths], diagnostics };
}

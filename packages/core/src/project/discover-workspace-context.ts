import { existsSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { canonicalPath, isPathInside } from '../path-utils.js';
import { loadTsconfig } from '../tsconfig/load-tsconfig.js';
import { detectWorkspacePackages } from '../workspace/detect-workspace-packages.js';
import { findNearestTsconfig } from './find-nearest-tsconfig.js';
import { findWorkspaceRoot } from './find-workspace-root.js';
import type {
  WorkspaceContext,
  WorkspaceContextDiagnostic,
  WorkspaceProject,
} from './types.js';

function configPathFromReference(path: string): string {
  if (extname(path) === '.json') return path;
  if (existsSync(path) && statSync(path).isFile()) return path;
  return join(path, 'tsconfig.json');
}

function searchDirectory(path: string): string {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return statSync(candidate).isDirectory() ? candidate : dirname(candidate);
}

export function discoverWorkspaceContext(startPath: string): WorkspaceContext {
  const absoluteStartPath = resolve(startPath);
  const workspaceRoot = findWorkspaceRoot(absoluteStartPath);
  const discoveredConfig = findNearestTsconfig(absoluteStartPath);
  const nearestConfig =
    discoveredConfig && (!workspaceRoot || isPathInside(discoveredConfig, workspaceRoot, true))
      ? discoveredConfig
      : undefined;
  const rootDir = workspaceRoot ?? (nearestConfig ? dirname(nearestConfig) : absoluteStartPath);
  const workspace = workspaceRoot ? detectWorkspacePackages(workspaceRoot) : undefined;
  const workspacePackages = workspace?.workspacePackages ?? new Map<string, string>();
  const diagnostics: WorkspaceContext['diagnostics'][number][] = [
    ...(workspace?.diagnostics ?? []),
  ];

  const pending = new Set<string>();
  if (nearestConfig) pending.add(nearestConfig);

  if (
    workspaceRoot &&
    canonicalPath(searchDirectory(absoluteStartPath)) === canonicalPath(workspaceRoot)
  ) {
    const rootConfig = join(rootDir, 'tsconfig.json');
    if (existsSync(rootConfig)) pending.add(rootConfig);
    for (const packageDir of workspacePackages.values()) {
      const packageConfig = join(packageDir, 'tsconfig.json');
      if (existsSync(packageConfig)) pending.add(packageConfig);
    }
  }

  if (pending.size === 0) {
    const diagnostic: WorkspaceContextDiagnostic = {
      severity: 'error',
      code: 'no-tsconfig-found',
      message: `Could not find a tsconfig.json for '${absoluteStartPath}'.`,
      path: absoluteStartPath,
    };
    diagnostics.push(diagnostic);
  }

  const projects = new Map<string, WorkspaceProject>();
  while (pending.size > 0) {
    const configFilePath = [...pending].sort()[0]!;
    pending.delete(configFilePath);
    const normalizedPath = resolve(configFilePath);
    const projectKey = canonicalPath(normalizedPath);
    if (projects.has(projectKey)) continue;

    if (!existsSync(normalizedPath)) {
      diagnostics.push({
        severity: 'warning',
        code: 'referenced-tsconfig-missing',
        message: `Referenced tsconfig '${normalizedPath}' does not exist.`,
        path: normalizedPath,
      });
      continue;
    }

    const tsconfig = loadTsconfig(normalizedPath);
    projects.set(projectKey, { configFilePath: normalizedPath, tsconfig });
    for (const reference of tsconfig.references) {
      pending.add(configPathFromReference(reference.path));
    }
  }

  return {
    rootDir,
    workspace,
    workspacePackages,
    projects: [...projects.values()].sort((a, b) =>
      a.configFilePath.localeCompare(b.configFilePath),
    ),
    diagnostics,
  };
}

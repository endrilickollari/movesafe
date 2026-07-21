import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { parsePackageJsonWorkspaces } from './parse-package-json-workspaces.js';
import { parsePnpmWorkspaceYaml } from './parse-pnpm-workspace-yaml.js';
import type { WorkspaceDiagnostic, WorkspacePackageManager } from './types.js';

export interface PackageManagerDetection {
  readonly packageManager: WorkspacePackageManager | undefined;
  readonly patterns: readonly string[];
  readonly diagnostics: readonly WorkspaceDiagnostic[];
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function packageManagerFromField(value: unknown): WorkspacePackageManager | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('pnpm@')) return 'pnpm';
  if (value.startsWith('yarn@')) return 'yarn';
  if (value.startsWith('npm@')) return 'npm';
  return undefined;
}

/** Negation patterns (`!excluded`) aren't supported in v1 — dropped and diagnosed
 *  rather than silently mis-globbed as a literal directory named `!excluded`. */
function filterNegationPatterns(
  patterns: readonly string[],
  diagnostics: WorkspaceDiagnostic[],
): readonly string[] {
  return patterns.filter((pattern) => {
    if (!pattern.startsWith('!')) return true;
    diagnostics.push({
      severity: 'warning',
      code: 'unsupported-negation-pattern',
      message: `Negation pattern '${pattern}' is not supported and was ignored.`,
      path: pattern,
    });
    return false;
  });
}

/**
 * Precedence matches real tool behavior: pnpm-workspace.yaml, when present,
 * always wins and is the only file pnpm itself ever reads for workspace globs
 * (unlike yarn/npm, it never consults package.json#workspaces).
 */
export function detectPackageManager(rootDir: string): PackageManagerDetection {
  const diagnostics: WorkspaceDiagnostic[] = [];
  const packageJsonPath = `${rootDir}/package.json`;
  const packageJson = ts.sys.fileExists(packageJsonPath) ? readJson(packageJsonPath) : undefined;
  const declaredPackageManager = packageManagerFromField(
    typeof packageJson === 'object' && packageJson !== null
      ? (packageJson as Record<string, unknown>).packageManager
      : undefined,
  );
  const packageJsonWorkspaces = parsePackageJsonWorkspaces(packageJson);

  const pnpmWorkspacePath = `${rootDir}/pnpm-workspace.yaml`;
  if (ts.sys.fileExists(pnpmWorkspacePath)) {
    if (packageJsonWorkspaces !== undefined) {
      diagnostics.push({
        severity: 'info',
        code: 'multiple-workspace-configs-found',
        message:
          "Both pnpm-workspace.yaml and package.json#workspaces are present; pnpm-workspace.yaml wins and package.json#workspaces is ignored.",
        path: packageJsonPath,
      });
    }

    const yamlText = ts.sys.readFile(pnpmWorkspacePath);
    const parsedYaml = yamlText === undefined ? undefined : parsePnpmWorkspaceYaml(yamlText);

    if (parsedYaml === undefined || parsedYaml.parseError !== undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'unparsable-pnpm-workspace-yaml',
        message: parsedYaml?.parseError ?? `Could not read '${pnpmWorkspacePath}'.`,
        path: pnpmWorkspacePath,
      });
      return { packageManager: 'pnpm', patterns: [], diagnostics };
    }

    return {
      packageManager: 'pnpm',
      patterns: filterNegationPatterns(parsedYaml.patterns, diagnostics),
      diagnostics,
    };
  }

  if (packageJsonWorkspaces !== undefined) {
    const packageManager =
      declaredPackageManager ??
      (ts.sys.fileExists(`${rootDir}/yarn.lock`)
        ? 'yarn'
        : ts.sys.fileExists(`${rootDir}/package-lock.json`)
          ? 'npm'
          : undefined);

    if (packageManager === undefined) {
      diagnostics.push({
        severity: 'info',
        code: 'ambiguous-package-manager',
        message:
          'package.json#workspaces is present but neither a packageManager field nor a recognizable lockfile identifies yarn vs npm.',
        path: packageJsonPath,
      });
    }

    return {
      packageManager,
      patterns: filterNegationPatterns(packageJsonWorkspaces, diagnostics),
      diagnostics,
    };
  }

  diagnostics.push({
    severity: 'warning',
    code: 'no-workspace-config-found',
    message: `No pnpm-workspace.yaml or package.json#workspaces found under '${rootDir}'.`,
    path: rootDir,
  });
  return { packageManager: declaredPackageManager, patterns: [], diagnostics };
}

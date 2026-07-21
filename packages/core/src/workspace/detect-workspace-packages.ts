import { detectPackageManager } from './detect-package-manager.js';
import { detectTurborepo } from './detect-turborepo.js';
import { expandWorkspaceGlobs } from './expand-workspace-globs.js';
import { readWorkspacePackageName } from './read-workspace-package-name.js';
import type { DetectWorkspacePackagesResult, WorkspaceDiagnostic } from './types.js';

export function detectWorkspacePackages(rootDir: string): DetectWorkspacePackagesResult {
  const normalizedRootDir = rootDir.replace(/\\/g, '/').replace(/\/$/, '');

  const { packageManager, patterns, diagnostics: managerDiagnostics } =
    detectPackageManager(normalizedRootDir);
  const hasTurborepo = detectTurborepo(normalizedRootDir);

  const diagnostics: WorkspaceDiagnostic[] = [...managerDiagnostics];
  const workspacePackages = new Map<string, string>();

  if (patterns.length > 0) {
    const { packageJsonPaths, diagnostics: globDiagnostics } = expandWorkspaceGlobs(
      normalizedRootDir,
      patterns,
    );
    diagnostics.push(...globDiagnostics);

    for (const packageJsonPath of packageJsonPaths) {
      const result = readWorkspacePackageName(packageJsonPath);
      if (!result.ok) {
        diagnostics.push({
          severity: 'warning',
          code: result.reason === 'unreadable' ? 'unreadable-package-json' : 'package-json-missing-name',
          message:
            result.reason === 'unreadable'
              ? `Could not read or parse '${packageJsonPath}'.`
              : `'${packageJsonPath}' has no valid "name" field.`,
          path: packageJsonPath,
        });
        continue;
      }

      if (workspacePackages.has(result.entry.name)) {
        diagnostics.push({
          severity: 'warning',
          code: 'duplicate-package-name',
          message: `Package name '${result.entry.name}' is declared by more than one workspace package; keeping the first match.`,
          path: packageJsonPath,
        });
        continue;
      }

      workspacePackages.set(result.entry.name, result.entry.directory);
    }
  }

  return {
    rootDir: normalizedRootDir,
    packageManager,
    hasTurborepo,
    patterns,
    workspacePackages,
    diagnostics,
  };
}

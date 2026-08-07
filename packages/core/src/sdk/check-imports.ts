import { resolve } from 'node:path';
import { runCheck } from '../check/run-check.js';
import type { CheckFinding } from '../check/types.js';
import type { GraphWarning } from '../graph/types.js';
import { analyzeWorkspace } from '../project/analyze-workspace.js';
import { discoverWorkspaceContext } from '../project/discover-workspace-context.js';
import type { WorkspaceContext } from '../project/types.js';
import type {
  CheckImportsOptions,
  CheckImportsResult,
  CheckSummary,
  ProjectCheckReport,
  SdkDiagnostic,
} from './types.js';

type ReportEntry = CheckFinding | SdkDiagnostic;

function summarize(entries: readonly ReportEntry[]): CheckSummary {
  return {
    errorCount: entries.filter((entry) => entry.severity === 'error').length,
    warningCount: entries.filter((entry) => entry.severity === 'warning').length,
    infoCount: entries.filter((entry) => entry.severity === 'info').length,
    total: entries.length,
  };
}

function graphWarningDiagnostic(warning: GraphWarning): SdkDiagnostic | undefined {
  if (warning.source === 'tsconfig') {
    return {
      severity:
        warning.diagnostic.severity === 'error'
          ? 'error'
          : warning.diagnostic.severity === 'warning'
            ? 'warning'
            : 'info',
      code: `TS${warning.diagnostic.code}`,
      message: warning.diagnostic.message,
      path: warning.diagnostic.configFilePath,
      source: 'tsconfig',
    };
  }

  if (warning.source === 'scanner') {
    return {
      severity: 'warning',
      code: warning.warning.kind,
      message: warning.warning.message,
      path: warning.filePath,
      source: 'scanner',
    };
  }

  if (warning.warning.kind === 'unresolved') return undefined;
  return {
    severity: 'warning',
    code: warning.warning.kind,
    message: warning.warning.message,
    path: warning.warning.containingFile,
    source: 'resolver',
  };
}

function workspaceDiagnostics(context: WorkspaceContext): SdkDiagnostic[] {
  return context.diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    source: 'workspace',
  }));
}

function dedupe<T extends { readonly code: string; readonly message: string; readonly path: string | undefined }>(
  values: readonly T[],
): T[] {
  const unique = new Map<string, T>();
  for (const value of values) {
    unique.set(`${value.code}\0${value.path ?? ''}\0${value.message}`, value);
  }
  return [...unique.values()].sort((a, b) => {
    const pathCompare = (a.path ?? '').localeCompare(b.path ?? '');
    return pathCompare !== 0 ? pathCompare : a.code.localeCompare(b.code);
  });
}

export function checkImports(options: CheckImportsOptions = {}): CheckImportsResult {
  const cwd = options.cwd ?? process.cwd();
  const target = resolve(cwd, options.path ?? '.');
  const context = discoverWorkspaceContext(target);
  const workspace = analyzeWorkspace(context);
  const projects: ProjectCheckReport[] = workspace.projects.map((analysis) => {
    const diagnostics = analysis.graph.warnings
      .map(graphWarningDiagnostic)
      .filter((diagnostic): diagnostic is SdkDiagnostic => diagnostic !== undefined);
    const findings = runCheck(analysis.graph).findings;
    const projectDiagnostics = dedupe(diagnostics);
    return {
      configFilePath: analysis.tsconfig.configFilePath,
      findings,
      diagnostics: projectDiagnostics,
      summary: summarize([...findings, ...projectDiagnostics]),
    };
  });

  const findings = dedupe<CheckFinding>(projects.flatMap((project) => project.findings));
  const diagnostics = dedupe([
    ...workspaceDiagnostics(context),
    ...projects.flatMap((project) => project.diagnostics),
  ]);
  const summary = summarize([...findings, ...diagnostics]);

  return {
    clean: summary.errorCount === 0,
    projects,
    findings,
    diagnostics,
    summary: { ...summary, projectCount: projects.length },
  };
}

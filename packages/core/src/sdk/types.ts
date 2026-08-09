import type { CheckFinding } from '../check/types.js';
import type { MovePlan } from '../planner/types.js';

export interface PlanMoveOptions {
  readonly from: string;
  readonly to: string;
  readonly cwd?: string;
  readonly onTiming?: (timing: PlanMoveTiming) => void;
}

export interface PlanMoveTiming {
  readonly phase: 'analysis' | 'verification';
  readonly durationMs: number;
}

export interface CheckImportsOptions {
  readonly path?: string;
  readonly cwd?: string;
}

export interface SdkDiagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly path: string | undefined;
  readonly source: 'workspace' | 'tsconfig' | 'scanner' | 'resolver';
}

export interface CheckSummary {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly total: number;
}

export interface ProjectCheckReport {
  readonly configFilePath: string;
  readonly findings: readonly CheckFinding[];
  readonly diagnostics: readonly SdkDiagnostic[];
  readonly summary: CheckSummary;
}

export interface CheckImportsResult {
  readonly clean: boolean;
  readonly projects: readonly ProjectCheckReport[];
  readonly findings: readonly CheckFinding[];
  readonly diagnostics: readonly SdkDiagnostic[];
  readonly summary: CheckSummary & {
    readonly projectCount: number;
  };
}

export type PlannedMove = MovePlan;

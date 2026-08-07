export const CORE_VERSION = '0.0.0';

export type { SourceOffset } from './ts-utils/types.js';
export * from './sdk/index.js';
export type { CheckFinding, CheckFindingCode } from './check/types.js';
export type { ApplyDiagnostic, ApplyDiagnosticCode, ApplyResult } from './apply/types.js';
export { applyMove } from './apply/apply-move.js';
export type {
  Edit,
  FileMove,
  MovePlan,
  MovePlanDiagnostic,
  MovePlanDiagnosticCode,
  MovePlanOperation,
  MovePlanPrecondition,
  MovePlanScope,
  MovePlanStatus,
} from './planner/types.js';
export { MOVE_PLAN_SCHEMA_VERSION } from './planner/types.js';

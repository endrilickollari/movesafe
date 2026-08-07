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
} from './types.js';
export { MOVE_PLAN_SCHEMA_VERSION } from './types.js';
export { planMove as planProjectMove } from './plan-move.js';
export { planDirectoryMove } from './plan-directory-move.js';
export { computePlanHash, finalizeMovePlan, mergeVerificationDiagnostics } from './finalize-move-plan.js';
export { collectSealPaths, sealMovePlan } from './seal-move-plan.js';

import { describe, expect, it } from 'vitest';
import { MOVE_PLAN_SCHEMA_VERSION, finalizeMovePlan, mergeVerificationDiagnostics } from '../src/advanced.js';

describe('finalizeMovePlan', () => {
  it('stamps schemaVersion/status/planHash and derives preconditions for a ready plan', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [
        {
          file: '/proj/src/consumer.ts',
          span: { start: 10, end: 16 },
          oldText: './a.js',
          newText: './b.js',
          reason: 'Inbound import specifier recomputed after move.',
        },
      ],
      diagnostics: [],
    });

    expect(plan.schemaVersion).toBe(MOVE_PLAN_SCHEMA_VERSION);
    expect(plan.status).toBe('ready');
    expect(plan.planHash).toMatch(/^[0-9a-f]{16}$/);
    expect(plan.preconditions).toEqual([
      { kind: 'source-exists', path: '/proj/src/a.ts' },
      { kind: 'destination-absent', path: '/proj/src/b.ts' },
      {
        kind: 'edit-anchor',
        file: '/proj/src/consumer.ts',
        span: { start: 10, end: 16 },
        oldText: './a.js',
      },
    ]);
  });

  it('reports blocked status when a diagnostic is an error', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [],
      diagnostics: [
        { severity: 'error', code: 'source-not-in-graph', message: 'nope', path: '/proj/src/a.ts' },
      ],
    });

    expect(plan.status).toBe('blocked');
  });

  it('preserves the requested source root for directory application and plan identity', () => {
    const plan = finalizeMovePlan({
      operation: 'directory',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/next/src/a.ts' }],
      edits: [],
      diagnostics: [],
      sourceDirectory: '/proj',
    });

    expect(plan.preconditions[0]).toEqual({ kind: 'source-directory', path: '/proj' });
    expect(plan.planHash).not.toBe(
      finalizeMovePlan({
        operation: 'directory',
        scope: 'project',
        moves: plan.moves,
        edits: [],
        diagnostics: [],
        sourceDirectory: '/proj/src',
      }).planHash,
    );
  });

  it('is not affected by a warning-only diagnostic', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [],
      diagnostics: [
        { severity: 'warning', code: 'circular-dependency-warning', message: 'heads up', path: undefined },
      ],
    });

    expect(plan.status).toBe('ready');
  });

  it('two plans built from the same moves/edits share the same planHash regardless of diagnostics', () => {
    const build = (diagnostics: Parameters<typeof finalizeMovePlan>[0]['diagnostics']) =>
      finalizeMovePlan({
        operation: 'file',
        scope: 'project',
        moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
        edits: [],
        diagnostics,
      });

    const a = build([]);
    const b = build([{ severity: 'warning', code: 'circular-dependency-warning', message: 'x', path: undefined }]);

    expect(a.planHash).toBe(b.planHash);
  });
});

describe('mergeVerificationDiagnostics', () => {
  it('leaves a ready plan untouched when there is nothing to merge', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [],
      diagnostics: [],
    });

    expect(mergeVerificationDiagnostics(plan, [])).toBe(plan);
  });

  it('flips a ready plan to blocked and appends the verification diagnostics', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [],
      diagnostics: [],
    });

    const merged = mergeVerificationDiagnostics(plan, [
      {
        severity: 'error',
        code: 'broken-import-after-move',
        message: 'nope',
        path: '/proj/src/consumer.ts',
      },
    ]);

    expect(merged.status).toBe('blocked');
    expect(merged.diagnostics).toHaveLength(1);
    expect(merged.planHash).toBe(plan.planHash);
  });
});

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collectSealPaths, finalizeMovePlan, sealMovePlan } from '../src/advanced.js';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

describe('collectSealPaths', () => {
  it('is the union of every move source and every distinct edited file', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [
        {
          file: '/proj/src/consumer.ts',
          span: { start: 0, end: 5 },
          oldText: 'x',
          newText: 'y',
          reason: 'r',
        },
        {
          file: '/proj/src/a.ts',
          span: { start: 0, end: 5 },
          oldText: 'x',
          newText: 'y',
          reason: 'r',
        },
      ],
      diagnostics: [],
    });

    expect(collectSealPaths(plan)).toEqual(new Set(['/proj/src/a.ts', '/proj/src/consumer.ts']));
  });
});

describe('sealMovePlan', () => {
  it('replaces source-exists/edit-anchor with a content-fingerprint per seal path and restamps planHash', () => {
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
          reason: 'r',
        },
      ],
      diagnostics: [],
    });

    const contents = new Map([
      ['/proj/src/a.ts', 'export const a = 1;\n'],
      ['/proj/src/consumer.ts', "import { a } from './a.js';\n"],
    ]);

    const sealed = sealMovePlan(plan, contents);

    expect(sealed.preconditions).toEqual(
      expect.arrayContaining([
        { kind: 'destination-absent', path: '/proj/src/b.ts' },
        { kind: 'content-fingerprint', path: '/proj/src/a.ts', sha256: sha256(contents.get('/proj/src/a.ts')!) },
        {
          kind: 'content-fingerprint',
          path: '/proj/src/consumer.ts',
          sha256: sha256(contents.get('/proj/src/consumer.ts')!),
        },
      ]),
    );
    expect(sealed.preconditions.some((p) => p.kind === 'source-exists' || p.kind === 'edit-anchor')).toBe(false);
    expect(sealed.planHash).not.toBe(plan.planHash);
  });

  it('is a no-op for a blocked plan', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [],
      diagnostics: [{ severity: 'error', code: 'source-not-in-graph', message: 'nope', path: '/proj/src/a.ts' }],
    });

    expect(sealMovePlan(plan, new Map())).toBe(plan);
  });

  it('produces a different planHash for the same plan when the content on disk differs', () => {
    const plan = finalizeMovePlan({
      operation: 'file',
      scope: 'project',
      moves: [{ fromFilePath: '/proj/src/a.ts', toFilePath: '/proj/src/b.ts' }],
      edits: [],
      diagnostics: [],
    });

    const sealedA = sealMovePlan(plan, new Map([['/proj/src/a.ts', 'export const a = 1;\n']]));
    const sealedB = sealMovePlan(plan, new Map([['/proj/src/a.ts', 'export const a = 2;\n']]));

    expect(sealedA.planHash).not.toBe(sealedB.planHash);
  });
});

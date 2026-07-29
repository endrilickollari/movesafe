import { describe, expect, it } from 'vitest';
import { detectDependencyCycle } from '../src/index.js';

describe('detectDependencyCycle', () => {
  it('returns undefined when there is no path back to the source', () => {
    const graph = new Map([
      ['a', new Set(['b'])],
      ['b', new Set<string>()],
    ]);

    expect(detectDependencyCycle(graph, 'a', 'b')).toBeUndefined();
  });

  it('finds a direct 2-package cycle', () => {
    const graph = new Map([
      ['a', new Set<string>()],
      ['b', new Set(['a'])],
    ]);

    expect(detectDependencyCycle(graph, 'a', 'b')).toEqual(['b', 'a']);
  });

  it('finds a transitive 3-hop cycle', () => {
    const graph = new Map([
      ['a', new Set<string>()],
      ['b', new Set(['c'])],
      ['c', new Set(['a'])],
    ]);

    expect(detectDependencyCycle(graph, 'a', 'b')).toEqual(['b', 'c', 'a']);
  });

  it('handles a self-reference without infinite looping', () => {
    const graph = new Map([['a', new Set(['a'])]]);

    expect(detectDependencyCycle(graph, 'a', 'a')).toEqual(['a']);
  });

  it('does not falsely detect a cycle through an unrelated branch', () => {
    const graph = new Map([
      ['a', new Set<string>()],
      ['b', new Set(['d'])],
      ['c', new Set(['a'])],
      ['d', new Set<string>()],
    ]);

    expect(detectDependencyCycle(graph, 'a', 'b')).toBeUndefined();
  });
});

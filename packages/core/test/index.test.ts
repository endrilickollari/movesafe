import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index.js';

describe('@movesafe/core', () => {
  it('exposes a version placeholder', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});

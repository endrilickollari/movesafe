import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '@movesafe/core';

describe('movesafe cli', () => {
  it('can resolve @movesafe/core from the workspace', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});

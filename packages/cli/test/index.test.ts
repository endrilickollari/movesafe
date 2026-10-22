import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '@movesafe/core';

describe('movesafe cli', () => {
  it('can resolve @movesafe/core from the workspace', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(CORE_VERSION).toBe(manifest.version);
  });
});

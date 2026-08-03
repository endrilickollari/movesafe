import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/index.js';

describe('check command --json/--md conflict', () => {
  it('rejects passing both --json and --md', async () => {
    const program = createProgram({ exitOverride: true });

    await expect(
      program.parseAsync(['node', 'movesafe', 'check', '--json', '--md']),
    ).rejects.toMatchObject({ code: 'commander.conflictingOption' });
  });
});

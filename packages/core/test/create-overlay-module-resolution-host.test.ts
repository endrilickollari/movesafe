import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOverlayModuleResolutionHost } from '../src/verify/index.js';

describe('createOverlayModuleResolutionHost', () => {
  it('matches overlay entries by canonical path identity', () => {
    const root = join(process.cwd(), 'virtual-overlay');
    const equivalentRoot = `${root}${sep}nested${sep}..`;
    const host = createOverlayModuleResolutionHost(
      {
        fileExists: () => false,
        readFile: () => undefined,
        directoryExists: () => false,
      },
      new Map([
        [`${equivalentRoot}${sep}moved.ts`, 'export const moved = true;'],
        [`${equivalentRoot}${sep}removed.ts`, null],
      ]),
    );

    expect(host.fileExists(join(root, 'moved.ts'))).toBe(true);
    expect(host.readFile(join(root, 'moved.ts'))).toBe('export const moved = true;');
    expect(host.fileExists(join(root, 'removed.ts'))).toBe(false);
    expect(host.directoryExists?.(root)).toBe(true);
  });
});

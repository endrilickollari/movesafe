import { join, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPathInside, toFileSystemPath, toModulePath } from '../src/path-utils.js';
import { computeRelativeSpecifier } from '../src/planner/compute-relative-specifier.js';
import { substituteDirPrefix } from '../src/planner/directory-path-utils.js';

describe('filesystem path helpers', () => {
  it('uses native path segments for containment', () => {
    const root = join(process.cwd(), 'workspace', 'package');

    expect(isPathInside(join(root, 'src', 'index.ts'), root)).toBe(true);
    expect(isPathInside(join(root, '..cache', 'index.ts'), root)).toBe(true);
    expect(isPathInside(join(root, '..', 'other', 'index.ts'), root)).toBe(false);
  });

  it('keeps filesystem paths native and module specifiers slash-separated', () => {
    const root = join(process.cwd(), 'workspace');
    const source = join(root, 'src', 'feature.ts');
    const destination = join(root, 'lib', 'feature.ts');

    expect(substituteDirPrefix(source, join(root, 'src'), join(root, 'moved'))).toBe(
      join(root, 'moved', 'feature.ts'),
    );
    expect(computeRelativeSpecifier(join(root, 'src', 'consumer.ts'), destination, './feature.js')).toBe(
      '../lib/feature.js',
    );
  });

  it('converts Windows filesystem paths to TypeScript graph paths', () => {
    expect(toModulePath(String.raw`C:\workspace\src\feature.ts`, win32.sep)).toBe(
      'C:/workspace/src/feature.ts',
    );
  });

  it('converts TypeScript graph paths to Windows filesystem paths', () => {
    expect(toFileSystemPath('C:/workspace/src/feature.ts', win32.sep)).toBe(
      String.raw`C:\workspace\src\feature.ts`,
    );
  });
});

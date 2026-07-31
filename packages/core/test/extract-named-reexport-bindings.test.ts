import { describe, expect, it } from 'vitest';
import { parseSourceFile } from '../src/ts-utils/index.js';
import { extractNamedReexportBindings, fileHasExportStar } from '../src/check/extract-named-reexport-bindings.js';

function parse(sourceText: string) {
  return parseSourceFile('/virtual/test.ts', sourceText);
}

describe('extractNamedReexportBindings', () => {
  it('extracts named bindings, using the source-side (not renamed) name', () => {
    const sourceFile = parse(`export { a, b as c } from './x.js';`);
    const groups = extractNamedReexportBindings(sourceFile);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.bindings).toEqual([
      { originalName: 'a', aliasName: 'a' },
      { originalName: 'b', aliasName: 'c' },
    ]);
  });

  it('gives each statement its own group, even when two statements share the same specifier', () => {
    const sourceFile = parse(`
      export { a } from './x.js';
      export { b } from './x.js';
    `);
    const groups = extractNamedReexportBindings(sourceFile);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.bindings).toEqual([{ originalName: 'a', aliasName: 'a' }]);
    expect(groups[1]?.bindings).toEqual([{ originalName: 'b', aliasName: 'b' }]);
    expect(groups[0]?.statementStart).not.toBe(groups[1]?.statementStart);
  });

  it('excludes export * from and export * as ns from', () => {
    const sourceFile = parse(`
      export * from './x.js';
      export * as ns from './y.js';
    `);
    expect(extractNamedReexportBindings(sourceFile)).toEqual([]);
  });

  it('excludes bare export { a } with no module specifier', () => {
    const sourceFile = parse(`const a = 1;\nexport { a };`);
    expect(extractNamedReexportBindings(sourceFile)).toEqual([]);
  });
});

describe('fileHasExportStar', () => {
  it('is true for a bare export * from', () => {
    expect(fileHasExportStar(parse(`export * from './x.js';`))).toBe(true);
  });

  it('is false for export * as ns from (a real, checkable name)', () => {
    expect(fileHasExportStar(parse(`export * as ns from './x.js';`))).toBe(false);
  });

  it('is false for named re-exports and declarations', () => {
    expect(fileHasExportStar(parse(`export { a } from './x.js';\nexport function b() {}`))).toBe(false);
  });
});

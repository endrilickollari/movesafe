import { describe, expect, it } from 'vitest';
import { scanFile } from '../src/scanner/index.js';
import type { ImportSpecifierRecord } from '../src/scanner/types.js';

function expectRoundTrip(sourceText: string, record: ImportSpecifierRecord): void {
  expect(sourceText.slice(record.specifierOffset.start, record.specifierOffset.end)).toBe(
    record.moduleText,
  );
}

describe('scanFile', () => {
  it('static default import', () => {
    const src = "import a from './a';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers).toHaveLength(1);
    expect(specifiers[0]).toMatchObject({
      formKind: 'import',
      moduleText: './a',
      isTypeOnly: false,
    });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('static named import', () => {
    const src = "import { b, c } from './b';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers).toHaveLength(1);
    expect(specifiers[0]).toMatchObject({ formKind: 'import', moduleText: './b' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('static namespace import', () => {
    const src = "import * as ns from './c';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({ formKind: 'import', moduleText: './c' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('mixed default + named import', () => {
    const src = "import d, { e } from './d';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({ formKind: 'import', moduleText: './d' });
  });

  it('whole-statement type-only import', () => {
    const src = "import type { F } from './e';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({
      formKind: 'import',
      moduleText: './e',
      isTypeOnly: true,
    });
  });

  it('inline per-specifier type-only import does not set the whole-statement flag', () => {
    const src = "import { type G } from './f';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({
      formKind: 'import',
      moduleText: './f',
      isTypeOnly: false,
    });
  });

  it('named re-export', () => {
    const src = "export { h } from './g';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({ formKind: 'exportFrom', moduleText: './g' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('export star', () => {
    const src = "export * from './h';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({ formKind: 'exportStar', moduleText: './h' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('export star as namespace', () => {
    const src = "export * as ns2 from './i';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({ formKind: 'exportStarAs', moduleText: './i' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('export type { } from is type-only exportFrom', () => {
    const src = "export type { J } from './j';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({
      formKind: 'exportFrom',
      moduleText: './j',
      isTypeOnly: true,
    });
  });

  it('export type * from is type-only exportStar', () => {
    const src = "export type * from './k';";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({
      formKind: 'exportStar',
      moduleText: './k',
      isTypeOnly: true,
    });
  });

  it('require call with string literal', () => {
    const src = "const r = require('./l');";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({ formKind: 'requireCall', moduleText: './l' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('require call with no-substitution template literal', () => {
    const src = 'const t = require(`./m`);';
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({
      formKind: 'requireCall',
      moduleText: './m',
      quote: '`',
    });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('dynamic import, bare and awaited', () => {
    const src = `
      const p = import('./n');
      async function load() {
        await import('./o');
      }
    `;
    const { specifiers } = scanFile('virtual.ts', src);
    const dynamic = specifiers.filter((s) => s.formKind === 'dynamicImport');
    expect(dynamic).toHaveLength(2);
    expect(dynamic.map((s) => s.moduleText).sort()).toEqual(['./n', './o']);
    for (const record of dynamic) expectRoundTrip(src, record);
  });

  it('import-equals require', () => {
    const src = "import foo = require('./p');";
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers[0]).toMatchObject({
      formKind: 'importEqualsRequire',
      moduleText: './p',
    });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('skips computed require/import specifiers without throwing', () => {
    const src = `
      const mod = require(someVar);
      const dyn = import(someVar);
      const tpl = import(\`./x/\${y}\`);
    `;
    const result = scanFile('virtual.ts', src);
    expect(result.specifiers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('finds imports nested inside an ambient module block', () => {
    const src = `
      declare module 'virtual-mod' {
        import x from './q';
        export function f(): void;
      }
    `;
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers).toHaveLength(1);
    expect(specifiers[0]).toMatchObject({ formKind: 'import', moduleText: './q' });
    expectRoundTrip(src, specifiers[0]!);
  });

  it('kitchen sink: every form in one file round-trips', () => {
    const src = `
      import a from './a';
      import { b } from './b';
      import * as ns from './c';
      import type { D } from './d';
      export { e } from './e';
      export * from './f';
      export * as ns2 from './g';
      const r = require('./h');
      const p = import('./i');
      import eq = require('./j');
    `;
    const { specifiers } = scanFile('virtual.ts', src);
    expect(specifiers).toHaveLength(10);
    for (const record of specifiers) expectRoundTrip(src, record);
  });

  it('reads from disk when sourceText is omitted', () => {
    const result = scanFile(new URL('../src/index.ts', import.meta.url).pathname);
    expect(result.specifiers.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });
});

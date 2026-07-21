import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { loadTsconfig } from '../src/resolver/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/resolver/${segments.join('/')}`, import.meta.url).pathname;
}

describe('loadTsconfig', () => {
  it('parses a simple config with no extends/paths/references', () => {
    const result = loadTsconfig(fixturePath('simple', 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    expect(result.compilerOptions).toMatchObject({ target: ts.ScriptTarget.ES2020 });
    expect(result.references).toEqual([]);
    expect(result.paths).toMatchObject({
      baseUrl: undefined,
      paths: undefined,
      pathsBaseDir: undefined,
    });
  });

  it('resolves a multi-level extends chain, later configs overriding earlier ones', () => {
    const result = loadTsconfig(fixturePath('extends-chain', 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    expect(result.compilerOptions).toMatchObject({
      strict: true, // inherited from grandparent, untouched by parent/leaf
      declaration: true, // inherited from parent
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020, // parent's target overrides grandparent's ES2018
    });
  });

  it('resolves array-form extends with later entries winning', () => {
    const result = loadTsconfig(fixturePath('extends-array', 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    expect(result.compilerOptions).toMatchObject({
      strict: true, // from a.json, not overridden by b.json
      noUnusedLocals: true, // from b.json
      target: ts.ScriptTarget.ES2021, // b.json's target wins over a.json's ES2018
    });
  });

  it('resolves baseUrl to an absolute path and preserves raw paths patterns', () => {
    const result = loadTsconfig(fixturePath('paths-baseurl', 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    expect(result.paths.baseUrl).toBe(fixturePath('paths-baseurl'));
    expect(result.paths.pathsBaseDir).toBe(result.paths.baseUrl);
    expect(result.paths.paths).toMatchObject({ '@app/*': ['src/*'] });
  });

  it('falls back to the paths-without-baseUrl base directory', () => {
    const result = loadTsconfig(fixturePath('paths-no-baseurl', 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    expect(result.paths.baseUrl).toBeUndefined();
    expect(result.paths.pathsBaseDir).toBe(fixturePath('paths-no-baseurl'));
    expect(result.paths.paths).toMatchObject({ '@x/*': ['lib/*'] });
  });

  it('normalizes project references to absolute paths and preserves originalPath', () => {
    const result = loadTsconfig(fixturePath('references', 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    expect(result.references).toHaveLength(2);
    for (const ref of result.references) {
      expect(ref.path.startsWith('/')).toBe(true);
      expect(ref.originalPath).toBeDefined();
    }
    expect(result.references.map((r) => r.originalPath).sort()).toEqual(['./pkg-a', './pkg-b']);
  });

  it('surfaces a diagnostic for a missing extends target without throwing', () => {
    const result = loadTsconfig(fixturePath('error-missing-extends', 'tsconfig.json'));
    expect(() => result).not.toThrow();
    expect(result.diagnostics.some((d) => d.code === 5083 && d.severity === 'error')).toBe(true);
  });

  it('surfaces a diagnostic for malformed JSON without throwing', () => {
    const result = loadTsconfig(fixturePath('error-malformed-json', 'tsconfig.json'));
    expect(() => result).not.toThrow();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('returns an empty-but-well-formed result when the config file does not exist', () => {
    const result = loadTsconfig(fixturePath('does-not-exist', 'tsconfig.json'));
    expect(result.compilerOptions).toEqual({});
    expect(result.fileNames).toEqual([]);
    expect(result.references).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

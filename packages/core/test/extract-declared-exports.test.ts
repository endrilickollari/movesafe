import { describe, expect, it } from 'vitest';
import { extractDeclaredExports } from '../src/check/extract-declared-exports.js';

function extract(sourceText: string): ReadonlySet<string> {
  return extractDeclaredExports('/virtual/test.ts', sourceText);
}

describe('extractDeclaredExports', () => {
  it('collects exported function, class, interface, type, and enum declarations', () => {
    const names = extract(`
      export function foo() {}
      export class Bar {}
      export interface Baz {}
      export type Qux = string;
      export enum Quux { A, B }
    `);
    expect(names).toEqual(new Set(['foo', 'Bar', 'Baz', 'Qux', 'Quux']));
  });

  it('collects exported const/let/var, including multiple declarators and destructuring', () => {
    const names = extract(`
      export const a = 1, b = 2;
      export let c = 3;
      export const { d, e: f } = { d: 1, e: 2 };
      export const [g, h] = [1, 2];
    `);
    expect(names).toEqual(new Set(['a', 'b', 'c', 'd', 'f', 'g', 'h']));
  });

  it('maps every export default form to the literal name "default"', () => {
    expect(extract(`export default function foo() {}`)).toEqual(new Set(['default']));
    expect(extract(`export default class {}`)).toEqual(new Set(['default']));
    expect(extract(`const x = 1;\nexport default x;`)).toEqual(new Set(['default']));
  });

  it('collects bare export { a, b as c } and export type { d }', () => {
    const names = extract(`
      const a = 1;
      const b = 2;
      type d = string;
      export { a, b as c };
      export type { d };
    `);
    expect(names).toEqual(new Set(['a', 'c', 'd']));
  });

  it('dedupes function overload signatures into a single name', () => {
    const names = extract(`
      export function foo(a: string): void;
      export function foo(a: number): void;
      export function foo(a: unknown): void {}
    `);
    expect(names).toEqual(new Set(['foo']));
  });

  it('declares the alias name for export * as ns from', () => {
    const names = extract(`export * as ns from './other.js';`);
    expect(names).toEqual(new Set(['ns']));
  });

  it('excludes export = (CJS-only) and bare export namespace', () => {
    expect(extract(`const x = 1;\nexport = x;`)).toEqual(new Set());
    expect(extract(`export namespace Foo { export const a = 1; }`)).toEqual(new Set());
  });

  it('returns an empty set for a file with no exports', () => {
    expect(extract(`const a = 1;`)).toEqual(new Set());
  });
});

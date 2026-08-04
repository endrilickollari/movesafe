export interface BenchmarkRepo {
  readonly name: string;
  readonly gitUrl: string;
}

/**
 * Starting proposal, not verified against each repo's actual tsconfig —
 * classify-repo.ts determines the real plain/aliased/monorepo category
 * empirically after cloning. Edit freely; this is just data.
 *
 * Known limitation: this harness never runs a repo's own build step before
 * cloning + checking it. Repos whose package.json#exports resolves to build
 * output under a custom condition (e.g. zod's `@zod/source`) can show
 * false-positive `check` findings that have nothing to do with movesafe's
 * moves — confirmed for zod's `packages/resolution` importing
 * `zod/v4/locales/*.cjs`, which is equally unresolved before and after any
 * move, because the artifact simply doesn't exist without `pnpm build`.
 * Auto-building arbitrary cloned repos was judged out of scope (real
 * flakiness/security surface) rather than fixed.
 */
export const BENCHMARK_REPOS: readonly BenchmarkRepo[] = [
  { name: 'zod', gitUrl: 'https://github.com/colinhacks/zod.git' },
  { name: 'date-fns', gitUrl: 'https://github.com/date-fns/date-fns.git' },
  { name: 'zustand', gitUrl: 'https://github.com/pmndrs/zustand.git' },
  { name: 'valtio', gitUrl: 'https://github.com/pmndrs/valtio.git' },
  { name: 'type-fest', gitUrl: 'https://github.com/sindresorhus/type-fest.git' },
  { name: 'ky', gitUrl: 'https://github.com/sindresorhus/ky.git' },
  { name: 'trpc', gitUrl: 'https://github.com/trpc/trpc.git' },
  { name: 'class-validator', gitUrl: 'https://github.com/typestack/class-validator.git' },
  { name: 'nanostores', gitUrl: 'https://github.com/nanostores/nanostores.git' },
  { name: 'remeda', gitUrl: 'https://github.com/remeda/remeda.git' },
];

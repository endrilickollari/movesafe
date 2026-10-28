# @movesafe/core

The TypeScript import-graph, move-planning, and validation engine behind Movesafe.

Use the synchronous SDK to preview file or directory moves, inspect edits and diagnostics, and apply verified plans in developer tools and scripts.

## Install

Requires Node.js 22.13 or newer.

```bash
npm install @movesafe/core@0.2.1
```

## Usage

Run from your TypeScript project's directory:

```ts
import { applyMove, checkImports, planMove } from '@movesafe/core';

const plan = planMove({ from: 'src/utils.ts', to: 'src/lib/utils.ts' });

// Inspect the proposed edits and diagnostics before applying the plan.
if (plan.status === 'ready') {
  const applied = applyMove(plan);
  console.log(applied);
}

const result = checkImports({ path: '.' });
console.log(result);
```

Install the checked project's dependencies first. Movesafe uses TypeScript resolution to understand relative imports, aliases, barrels, and workspace packages. Computed import specifiers are reported rather than guessed.

ESM and CommonJS entry points include TypeScript declarations. Lower-level APIs are available through `@movesafe/core/advanced`.

## Learn more

- [Documentation](https://endrilickollari.github.io/movesafe/)
- [CLI](https://www.npmjs.com/package/movesafe)
- [MCP server](https://www.npmjs.com/package/@movesafe/mcp)
- [Source and issues](https://github.com/endrilickollari/movesafe)

## License

[MIT](https://github.com/endrilickollari/movesafe/blob/main/LICENSE)

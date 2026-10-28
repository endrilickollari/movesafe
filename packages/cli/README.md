# movesafe

Move TypeScript files without leaving broken imports behind.

Movesafe plans import edits before writing, verifies the resulting project, and applies file and directory moves with rollback support. It supports relative imports, TypeScript aliases, barrels, and workspace packages.

## Quick start

Requires Node.js 22.13 or newer. Run these commands in your TypeScript project:

```bash
npx --yes movesafe@0.2.1 mv src/utils.ts src/lib/utils.ts --dry-run
npx --yes movesafe@0.2.1 mv src/utils.ts src/lib/utils.ts
npx --yes movesafe@0.2.1 check .
```

Movesafe finds the nearest `tsconfig.json`. Install the checked project's dependencies first so TypeScript can resolve external packages.

## Check imports

```bash
npx --yes movesafe@0.2.1 check . --json
npx --yes movesafe@0.2.1 check . --md
```

The checker reports unresolved imports, orphaned barrel exports, and filename-case mismatches. It exits with status `1` when it finds an error.

## Learn more

- [Documentation](https://endrilickollari.github.io/movesafe/)
- [Core SDK](https://www.npmjs.com/package/@movesafe/core)
- [MCP server for coding agents](https://www.npmjs.com/package/@movesafe/mcp)
- [Source and issues](https://github.com/endrilickollari/movesafe)

## License

[MIT](https://github.com/endrilickollari/movesafe/blob/main/LICENSE)

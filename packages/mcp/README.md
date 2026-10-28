# @movesafe/mcp

An MCP server for planning and applying safe TypeScript file moves from coding agents.

Requires Node.js 22.13 or newer. The server uses the stdio transport.

## Configure your MCP client

Add this server to your client's MCP configuration:

```json
{
  "mcpServers": {
    "movesafe": {
      "command": "npx",
      "args": ["--yes", "@movesafe/mcp@0.2.1"]
    }
  }
}
```

Configure the client to run in your TypeScript project, or provide project paths in tool calls. Install your project's dependencies first so TypeScript can resolve external packages.

## Tools

- `plan_move`: compute a read-only plan, diff, diagnostics, and deterministic `planHash`.
- `apply_move`: recompute the plan and apply it only when its hash matches the reviewed plan.
- `check_imports`: check unresolved imports, orphaned barrel exports, and filename-case mismatches.

Review the plan before calling `apply_move`. If the project changes, create and review a fresh plan.

## Learn more

- [MCP documentation](https://endrilickollari.github.io/movesafe/mcp)
- [CLI](https://www.npmjs.com/package/movesafe)
- [Core SDK](https://www.npmjs.com/package/@movesafe/core)
- [Source and issues](https://github.com/endrilickollari/movesafe)

## License

[MIT](https://github.com/endrilickollari/movesafe/blob/main/LICENSE)

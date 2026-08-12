# MCP for coding agents

The Movesafe MCP server exposes planning, application, and validation as structured tools. It uses stdio and runs directly from npm.

## Configure the server

Add this server to an MCP-compatible client:

```json
{
  "mcpServers": {
    "movesafe": {
      "command": "npx",
      "args": ["--yes", "@movesafe/mcp@0.1.0"]
    }
  }
}
```

The server uses the client process's working directory. Pass paths relative to that directory or use absolute paths.

## Safe move protocol

Use the tools in this order:

```text
plan_move({ from, to })
        │
        ├─ blocked → inspect diagnostics; do not apply
        │
        └─ ready → review diff + planHash
                         │
                         └─ apply_move({ from, to, planHash })
```

`apply_move` recomputes the plan from current disk state. It applies only when the fresh hash exactly matches the reviewed `planHash`; otherwise it returns `hash-mismatch`. Call `plan_move` again and review the replacement diff.

## `plan_move`

Inputs:

```json
{ "from": "src/utils.ts", "to": "src/lib/utils.ts" }
```

The tool is read-only. It returns:

- `status`: `ready` or `blocked`;
- `operation`: `file` or `directory`;
- `scope`: `project` or `workspace`;
- the planned file moves and text edits;
- a structured diff and diagnostics;
- a deterministic `planHash`.

## `apply_move`

Inputs:

```json
{
  "from": "src/utils.ts",
  "to": "src/lib/utils.ts",
  "planHash": "hash returned by plan_move"
}
```

Statuses are `applied`, `rejected`, `partial`, and `hash-mismatch`. A partial result includes `manualRecoveryPaths`; surface those paths to a human instead of retrying blindly.

## `check_imports`

Run the same validator exposed by the CLI:

```json
{ "path": "." }
```

The path is optional and defaults to the server's working directory. The result includes all findings plus error, warning, info, and total counts. See [Check imports](./check.md) for checker scope.

## Domain outcomes and tool errors

A blocked plan, rejected apply, hash mismatch, or checker finding is a successful MCP call with a domain status in `structuredContent`. `isError: true` is reserved for an unexpected thrown exception. Agents should branch on `status` or `ok`, not treat every non-clean result as a protocol failure.

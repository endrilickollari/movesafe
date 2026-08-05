import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { checkImports } from './check-imports.js';
import { moveFile } from './move-file.js';

function jsonResult(value: unknown, isError: boolean): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'movesafe', version: '0.0.0' });

  server.registerTool(
    'move_file',
    {
      title: 'Move a TypeScript file',
      description: 'Moves a TypeScript file, rewriting every import that references it. With dryRun, returns the plan without touching disk.',
      inputSchema: {
        from: z.string().describe('Path to the file to move'),
        to: z.string().describe('Destination path'),
        dryRun: z.boolean().describe('If true, return the plan without applying it'),
      },
    },
    ({ from, to, dryRun }) => {
      try {
        const result = moveFile({ from, to, dryRun, cwd: process.cwd() });
        return jsonResult(result, !result.ok);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'check_imports',
    {
      title: 'Check imports',
      description: 'Scans a project for unresolvable imports, orphaned barrel exports, and case-sensitivity mismatches.',
      inputSchema: {
        path: z.string().optional().describe('Directory to check (defaults to the current directory)'),
      },
    },
    ({ path }) => {
      try {
        const result = checkImports({ path, cwd: process.cwd() });
        return jsonResult(result, !result.ok);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

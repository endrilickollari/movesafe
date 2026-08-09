import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ApplyMoveResult } from './apply-move.js';
import { applyMoveTool } from './apply-move.js';
import { checkImports } from './check-imports.js';
import type { PlanMoveResult } from './plan-move.js';
import { planMoveTool } from './plan-move.js';
import { applyMoveOutputSchema, checkImportsOutputSchema, planMoveOutputSchema } from './schemas.js';

/**
 * Every normal return is a successful tool call — `isError` stays `false`
 * even for a blocked plan, a rejected apply, or a checker that found
 * problems: those are domain outcomes carried in `structuredContent`, not
 * MCP-protocol failures. `isError: true` is reserved for `toolError` below,
 * the only path that fires on a thrown exception.
 */
function structuredResult(structuredContent: object, text: string): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent, isError: false };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function summarizePlan(plan: PlanMoveResult): string {
  if (plan.status === 'blocked') {
    const errorCount = plan.diagnostics.filter((d) => d.severity === 'error').length;
    return `Plan blocked: ${errorCount} error(s).`;
  }
  const fileCount = new Set(plan.diff.files.map((file) => file.newPath)).size;
  return `Plan ready: ${plan.edits.length} edit(s) across ${fileCount} file(s). Hash ${plan.planHash}.`;
}

function summarizeApply(result: ApplyMoveResult): string {
  switch (result.status) {
    case 'applied':
      return 'Applied.';
    case 'hash-mismatch':
      return 'Rejected: plan hash mismatch — call plan_move again and apply the new hash.';
    case 'partial':
      return `Partial: ${result.manualRecoveryPaths.length} path(s) need manual recovery.`;
    case 'rejected':
      return `Rejected: ${result.diagnostics.find((d) => d.severity === 'error')?.message ?? 'plan failed validation.'}`;
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'movesafe', version: '0.0.0' });

  server.registerTool(
    'plan_move',
    {
      title: 'Plan a move',
      description:
        'Plans moving a TypeScript file, directory, or cross-package file, rewriting every import that references it. Read-only — never touches disk. Returns a planHash to pass to apply_move.',
      inputSchema: {
        from: z.string().describe('Path to the file or directory to move'),
        to: z.string().describe('Destination path'),
      },
      outputSchema: planMoveOutputSchema,
    },
    ({ from, to }) => {
      try {
        const result = planMoveTool({ from, to, cwd: process.cwd() });
        return structuredResult(result, summarizePlan(result));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'apply_move',
    {
      title: 'Apply a planned move',
      description:
        'Applies the move planned by plan_move. Recomputes the plan from current disk state and refuses (hash-mismatch) if it no longer matches the supplied planHash — never applies a plan different from the one reviewed.',
      inputSchema: {
        from: z.string().describe('Path to the file or directory to move'),
        to: z.string().describe('Destination path'),
        planHash: z.string().describe('The planHash returned by plan_move for this exact move'),
      },
      outputSchema: applyMoveOutputSchema,
    },
    ({ from, to, planHash }) => {
      try {
        const result = applyMoveTool({ from, to, planHash, cwd: process.cwd() });
        return structuredResult(result, summarizeApply(result));
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
      outputSchema: checkImportsOutputSchema,
    },
    ({ path }) => {
      try {
        const result = checkImports({ path, cwd: process.cwd() });
        const text = result.ok
          ? 'Clean.'
          : `${result.summary.errorCount} error(s), ${result.summary.warningCount} warning(s).`;
        return structuredResult(result, text);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

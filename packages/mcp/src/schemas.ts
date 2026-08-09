import { z } from 'zod';

export const diagnosticSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  source: z.enum(['workspace', 'tsconfig', 'scanner', 'resolver']).optional(),
});

export const editSchema = z.object({
  file: z.string(),
  span: z.object({ start: z.number(), end: z.number() }),
  oldText: z.string(),
  newText: z.string(),
  reason: z.string(),
});

export const moveSchema = z.object({
  fromFilePath: z.string(),
  toFilePath: z.string(),
});

const diffLineSchema = z.object({
  kind: z.enum(['context', 'added', 'removed']),
  text: z.string(),
});

const diffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(diffLineSchema),
});

const fileDiffSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
  hunks: z.array(diffHunkSchema),
});

export const diffSchema = z.object({
  files: z.array(fileDiffSchema),
});

export const planMoveOutputSchema = {
  ok: z.boolean(),
  status: z.enum(['ready', 'blocked']),
  operation: z.enum(['file', 'directory']),
  scope: z.enum(['project', 'workspace']),
  planHash: z.string(),
  moves: z.array(moveSchema),
  edits: z.array(editSchema),
  diagnostics: z.array(diagnosticSchema),
  diff: diffSchema,
};

export const applyMoveOutputSchema = {
  ok: z.boolean(),
  status: z.enum(['applied', 'rejected', 'partial', 'hash-mismatch']),
  planHash: z.string(),
  diagnostics: z.array(diagnosticSchema),
  manualRecoveryPaths: z.array(z.string()),
};

export const checkImportsOutputSchema = {
  ok: z.boolean(),
  error: z.string().optional(),
  findings: z.array(diagnosticSchema),
  summary: z.object({
    errorCount: z.number(),
    warningCount: z.number(),
    infoCount: z.number(),
    total: z.number(),
  }),
};

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

function fixtureSourcePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

let tempDir: string;
let client: Client;
let originalCwd: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-mcp-server-'));
  originalCwd = process.cwd();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await client.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function useFixture(name: string): string {
  const dest = join(tempDir, name);
  cpSync(fixtureSourcePath(name), dest, { recursive: true });
  return dest;
}

describe('MCP server: isError and structuredContent contract', () => {
  it('a blocked plan_move is a successful tool call with structuredContent, not isError', async () => {
    const projectDir = useFixture('basic-project');
    process.chdir(projectDir);

    const result = await client.callTool({
      name: 'plan_move',
      arguments: { from: 'src/does-not-exist.ts', to: 'src/renamed.ts' },
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ ok: false, status: 'blocked' });
  });

  it('a ready plan_move validates against its declared outputSchema', async () => {
    const projectDir = useFixture('basic-project');
    process.chdir(projectDir);

    const result = await client.callTool({
      name: 'plan_move',
      arguments: { from: 'src/utils.ts', to: 'src/renamed.ts' },
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ ok: true, status: 'ready' });
  });

  it('apply_move with a stale hash is a successful tool call reporting hash-mismatch', async () => {
    const projectDir = useFixture('basic-project');
    process.chdir(projectDir);

    const result = await client.callTool({
      name: 'apply_move',
      arguments: { from: 'src/utils.ts', to: 'src/renamed.ts', planHash: 'stale' },
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      status: 'hash-mismatch',
      planHash: 'stale',
    });
  });

  it('check_imports finding problems is a successful tool call, not isError', async () => {
    const projectDir = useFixture('broken-project');
    process.chdir(projectDir);

    const result = await client.callTool({ name: 'check_imports', arguments: {} });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ ok: false });
    expect(
      (result.structuredContent as { summary: { errorCount: number } }).summary.errorCount,
    ).toBeGreaterThan(0);
  });

  it('a protocol-level failure (unknown tool) reports isError, unlike any domain outcome', async () => {
    const result = await client.callTool({ name: 'not_a_real_tool', arguments: {} });
    expect(result.isError).toBe(true);
  });
});

describe('MCP schema compatibility', () => {
  it('advertises required move arguments and an optional check path as JSON Schema', async () => {
    const { tools } = await client.listTools();
    const plan = tools.find((tool) => tool.name === 'plan_move')!;
    const apply = tools.find((tool) => tool.name === 'apply_move')!;
    const check = tools.find((tool) => tool.name === 'check_imports')!;

    expect(plan.inputSchema).toMatchObject({
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    });
    expect(apply.inputSchema).toMatchObject({
      type: 'object',
      properties: { planHash: { type: 'string' } },
      required: ['from', 'to', 'planHash'],
    });
    expect(check.inputSchema).toMatchObject({
      type: 'object',
      properties: { path: { type: 'string' } },
    });
    expect(check.inputSchema.required ?? []).toEqual([]);
    for (const tool of tools) {
      expect(tool.outputSchema).toMatchObject({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: expect.arrayContaining(['ok']),
      });
    }
  });

  const invalidCalls: { name: string; arguments: Record<string, unknown> }[] = [
    { name: 'plan_move', arguments: { to: 'src/renamed.ts' } },
    { name: 'plan_move', arguments: { from: 42, to: 'src/renamed.ts' } },
    { name: 'plan_move', arguments: { from: 'src/utils.ts', to: [] } },
    { name: 'apply_move', arguments: { from: 'src/utils.ts', to: 'src/renamed.ts' } },
    {
      name: 'apply_move',
      arguments: { from: 'src/utils.ts', to: 'src/renamed.ts', planHash: 42 },
    },
    { name: 'check_imports', arguments: { path: 42 } },
  ];

  it.each(invalidCalls)(
    'rejects invalid $name arguments $arguments without changing files',
    async (call) => {
      const projectDir = useFixture('basic-project');
      process.chdir(projectDir);
      const sourceBefore = readFileSync('src/utils.ts', 'utf8');
      const importerBefore = readFileSync('src/index.ts', 'utf8');

      const result = await client.callTool(call);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(readFileSync('src/utils.ts', 'utf8')).toBe(sourceBefore);
      expect(readFileSync('src/index.ts', 'utf8')).toBe(importerBefore);
      expect(existsSync('src/renamed.ts')).toBe(false);
    },
  );

  it('checks the current directory when the optional path is omitted', async () => {
    process.chdir(useFixture('basic-project'));
    await client.listTools();

    const omitted = await client.callTool({ name: 'check_imports', arguments: {} });
    const explicit = await client.callTool({ name: 'check_imports', arguments: { path: '.' } });

    expect(omitted.isError).toBe(false);
    expect(omitted.structuredContent).toMatchObject({ ok: true, findings: [] });
    expect(omitted.structuredContent).toEqual(explicit.structuredContent);
  });

  it('validates a plan, apply, and check round trip against advertised output schemas', async () => {
    process.chdir(useFixture('basic-project'));
    // Populate the SDK client's output-schema validators before calling each tool.
    await client.listTools();
    const move = { from: 'src/utils.ts', to: 'src/renamed.ts' };

    const plan = await client.callTool({ name: 'plan_move', arguments: move });
    expect(plan.isError).toBe(false);
    expect(plan.structuredContent).toMatchObject({ ok: true, status: 'ready' });
    const planHash = plan.structuredContent!.planHash;
    expect(planHash).toEqual(expect.any(String));
    expect(existsSync(move.from)).toBe(true);
    expect(existsSync(move.to)).toBe(false);

    const applied = await client.callTool({ name: 'apply_move', arguments: { ...move, planHash } });
    expect(applied.isError).toBe(false);
    expect(applied.structuredContent).toMatchObject({ ok: true, status: 'applied', planHash });
    expect(existsSync(move.from)).toBe(false);
    expect(existsSync(move.to)).toBe(true);
    expect(readFileSync('src/index.ts', 'utf8')).toContain('./renamed.js');

    const checked = await client.callTool({ name: 'check_imports', arguments: {} });
    expect(checked.isError).toBe(false);
    expect(checked.structuredContent).toMatchObject({
      ok: true,
      findings: [],
      summary: { errorCount: 0, warningCount: 0, infoCount: 0, total: 0 },
    });
  });
});

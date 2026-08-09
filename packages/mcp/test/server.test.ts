import { cpSync, mkdtempSync, rmSync } from 'node:fs';
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
    expect(result.structuredContent).toMatchObject({ ok: false, status: 'hash-mismatch', planHash: 'stale' });
  });

  it('check_imports finding problems is a successful tool call, not isError', async () => {
    const projectDir = useFixture('broken-project');
    process.chdir(projectDir);

    const result = await client.callTool({ name: 'check_imports', arguments: {} });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ ok: false });
    expect((result.structuredContent as { summary: { errorCount: number } }).summary.errorCount).toBeGreaterThan(0);
  });

  it('a protocol-level failure (unknown tool) reports isError, unlike any domain outcome', async () => {
    const result = await client.callTool({ name: 'not_a_real_tool', arguments: {} });
    expect(result.isError).toBe(true);
  });
});

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = mkdtempSync(join(tmpdir(), 'movesafe-package-smoke-'));
const packDir = join(tempDir, 'packs');
const consumerDir = join(tempDir, 'consumer');
const npmCacheDir = join(tempDir, 'npm-cache');
mkdirSync(packDir, { recursive: true });

function commandInvocation(command, args) {
  return process.platform === 'win32'
    ? {
        command: process.env.ComSpec ?? 'cmd.exe',
        args: ['/d', '/s', '/c', command === 'node' ? command : `${command}.cmd`, ...args],
      }
    : { command, args };
}

function run(command, args, options = {}) {
  const invocation = commandInvocation(command, args);
  return execFileSync(invocation.command, invocation.args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

function inspectPackage(packageDir) {
  const { files } = JSON.parse(run('pnpm', ['pack', '--dry-run', '--json'], { cwd: packageDir }));
  const unexpected = files
    .map(({ path }) => path)
    .filter((path) => path !== 'package.json' && path !== 'LICENSE' && !path.startsWith('dist/'));
  assert(unexpected.length === 0, `${packageDir} packs unexpected files: ${unexpected.join(', ')}`);
  assert(
    files.every(({ path }) => !path.endsWith('.map')),
    `${packageDir} packs source maps`,
  );
}

function packPackage(packageDir) {
  inspectPackage(packageDir);
  const before = new Set(existsSync(packDir) ? readdirSync(packDir) : []);
  run('pnpm', ['pack', '--pack-destination', packDir], { cwd: packageDir });
  const archive = readdirSync(packDir).find((name) => name.endsWith('.tgz') && !before.has(name));
  assert(archive, `pnpm pack did not create an archive for ${packageDir}`);
  return join(packDir, archive);
}

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function discoverMcpTools() {
  return new Promise((resolvePromise, reject) => {
    const packageDir = join(consumerDir, 'node_modules', '@movesafe', 'mcp');
    const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
    const child = spawn(process.execPath, [join(packageDir, packageJson.bin['movesafe-mcp'])], {
      cwd: consumerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => finish(new Error(`MCP startup timed out. ${stderr}`)), 10_000);

    function finish(error, tools) {
      clearTimeout(timeout);
      child.kill();
      if (error) reject(error);
      else resolvePromise(tools);
    }

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      let newline = stdout.indexOf('\n');
      while (newline !== -1) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (line) {
          const message = JSON.parse(line);
          if (message.id === 1) {
            send(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
            send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
          }
          if (message.id === 2) finish(undefined, message.result.tools);
        }
        newline = stdout.indexOf('\n');
      }
    });
    child.on('error', finish);
    child.on('exit', (code) => {
      if (code && code !== 0) finish(new Error(`MCP exited with code ${code}. ${stderr}`));
    });

    send(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'movesafe-package-smoke', version: '1.0.0' },
      },
    });
  });
}

try {
  console.log('Packing publishable packages...');
  const archives = ['core', 'cli', 'mcp'].map((name) =>
    packPackage(join(rootDir, 'packages', name)),
  );

  write(
    join(consumerDir, 'package.json'),
    `${JSON.stringify({ name: 'movesafe-package-smoke', private: true, type: 'module' }, undefined, 2)}\n`,
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...archives], {
    cwd: consumerDir,
    env: { ...process.env, npm_config_cache: npmCacheDir },
  });

  console.log('Checking SDK exports and declarations...');
  const corePackage = JSON.parse(
    readFileSync(join(consumerDir, 'node_modules', '@movesafe', 'core', 'package.json'), 'utf8'),
  );
  for (const subpath of ['.', './advanced']) {
    const exported = corePackage.exports[subpath];
    assert(exported.import.types.endsWith('.d.ts'), `${subpath} lacks ESM declarations`);
    assert(exported.require.types.endsWith('.d.cts'), `${subpath} lacks CommonJS declarations`);
    for (const condition of ['import', 'require']) {
      for (const target of Object.values(exported[condition])) {
        assert(
          existsSync(join(consumerDir, 'node_modules', '@movesafe', 'core', target)),
          `${subpath} export target is missing: ${target}`,
        );
      }
    }
  }

  run(
    'node',
    [
      '--input-type=module',
      '--eval',
      "import { planMove } from '@movesafe/core'; if (typeof planMove !== 'function') process.exit(1)",
    ],
    { cwd: consumerDir },
  );
  run(
    'node',
    [
      '--input-type=commonjs',
      '--eval',
      "const { planMove } = require('@movesafe/core'); if (typeof planMove !== 'function') process.exit(1)",
    ],
    { cwd: consumerDir },
  );

  write(
    join(consumerDir, 'sdk.mts'),
    "import { planMove } from '@movesafe/core';\nvoid planMove;\n",
  );
  write(
    join(consumerDir, 'sdk.cts'),
    "import core = require('@movesafe/core');\nvoid core.planMove;\n",
  );
  write(
    join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['sdk.mts', 'sdk.cts'] }, undefined, 2)}\n`,
  );
  run('node', [join(consumerDir, 'node_modules', 'typescript', 'bin', 'tsc')], {
    cwd: consumerDir,
  });

  console.log('Checking installed CLI...');
  const help = run('npx', ['--no-install', 'movesafe', '--help'], { cwd: consumerDir });
  assert(help.includes('Move TypeScript files'), `Unexpected CLI help: ${JSON.stringify(help)}`);
  assert(
    run('npx', ['--no-install', 'movesafe', '--version'], { cwd: consumerDir }).trim() ===
      corePackage.version,
    'CLI and core versions differ',
  );

  const projectDir = join(consumerDir, 'fixture');
  const srcDir = join(projectDir, 'src');
  write(
    join(projectDir, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true }, include: ['src/**/*.ts'] }, undefined, 2)}\n`,
  );
  write(join(srcDir, 'utils.ts'), 'export const answer = 42;\n');
  write(join(srcDir, 'index.ts'), "import { answer } from './utils.js';\nexport { answer };\n");
  const preview = run(
    'npx',
    ['--no-install', 'movesafe', 'mv', 'src/utils.ts', 'src/lib/utils.ts', '--dry-run'],
    { cwd: projectDir },
  );
  assert(preview.includes('--- a/src/index.ts'), 'CLI dry-run did not render a diff');
  assert(existsSync(join(srcDir, 'utils.ts')), 'dry-run changed the source file');
  run('npx', ['--no-install', 'movesafe', 'mv', 'src/utils.ts', 'src/lib/utils.ts'], {
    cwd: projectDir,
  });
  assert(existsSync(join(srcDir, 'lib', 'utils.ts')), 'CLI did not move the file');
  assert(
    readFileSync(join(srcDir, 'index.ts'), 'utf8').includes("'./lib/utils.js'"),
    'CLI did not rewrite the importer',
  );
  run('npx', ['--no-install', 'movesafe', 'check', '.'], { cwd: projectDir });

  console.log('Checking installed MCP server...');
  const tools = await discoverMcpTools();
  assert(
    tools
      .map(({ name }) => name)
      .sort()
      .join(',') === 'apply_move,check_imports,plan_move',
    `Unexpected MCP tools: ${tools.map(({ name }) => name).join(', ')}`,
  );

  console.log('Packed-package smoke test passed.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

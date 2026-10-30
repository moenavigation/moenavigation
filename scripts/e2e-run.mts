import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer, type Server } from 'node:https';
import { resolve, sep } from 'node:path';
import { MongoClient } from 'mongodb';
import { generate } from 'selfsigned';
import { E2E_BASE_URL, E2E_DATABASE, seedE2eDatabase } from './e2e-fixtures';

const root = process.cwd(), owner = randomUUID();
const runRoot = resolve(root, '.local/e2e/runs'), runDirectory = resolve(runRoot, owner);
assert(runDirectory.startsWith(runRoot + sep) && /^[0-9a-f-]{36}$/.test(owner), 'Invalid owned E2E run directory.');
const children = new Set<ChildProcess>();
let proxy: Server | undefined;
let replica: import('mongodb-memory-server-core').MongoMemoryReplSet | undefined;
let originalNextEnv: Buffer | undefined;
let shuttingDown = false;
const startedAt = new Date().toISOString();
const logLines: string[] = [];

async function isolatedEnvironment(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Explicit empty values prevent Next's dotenv loader from repopulating secrets.
  // Read names only: no local environment value is logged, copied, or used.
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local']) {
    const text = await readFile(resolve(root, file), 'utf8').catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; });
    for (const line of text.split(/\r?\n/)) {
      const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      if (name) env[name] = '';
    }
  }
  for (const name of Object.keys(env)) if (/^(VERCEL_USAGE_|MONGODB_|CLOUDINARY_|RESEND_|ENQUIRY_EMAIL_|BACKUP_|MONGOMS_|MOE_E2E_)/.test(name)) env[name] = '';
  for (const name of ['MONGODB_URI', 'MONGODB_DB_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_URL', 'RESEND_API_KEY', 'ENQUIRY_EMAIL_FROM', 'ENQUIRY_EMAIL_TO']) env[name] = '';
  return { ...env, NODE_ENV: 'production', NEXT_DIST_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SITE_URL: E2E_BASE_URL, SITE_INDEXING_ENABLED: 'false', SITE_CONTENT_APPROVED: 'false', CLOUDINARY_CLOUD_NAME: 'moe-e2e', CLOUDINARY_FOLDER: 'moe-e2e', NEXT_PUBLIC_MAP_TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', NEXT_PUBLIC_MAP_TILE_ATTRIBUTION: 'Synthetic test tiles', MOE_E2E_OWNER: owner } satisfies NodeJS.ProcessEnv;
}

function launch(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('close', () => children.delete(child));
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', (chunk: Buffer) => {
    const text = chunk.toString(); logLines.push(text); process.stdout.write(text);
  });
  return child;
}
function completed(child: ChildProcess) {
  return new Promise<number>((resolveCode, reject) => { child.once('error', reject); child.once('close', code => resolveCode(code ?? 1)); });
}
async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const closed = completed(child).catch(() => 1);
  child.kill('SIGTERM');
  await Promise.race([closed, new Promise(resolveWait => setTimeout(resolveWait, 5000))]);
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    if (process.platform === 'win32') {
      const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await new Promise<void>(resolveKill => kill.once('close', () => resolveKill()));
    } else child.kill('SIGKILL');
    await closed;
  }
}
async function available(port: number) {
  const server = createHttpServer();
  await new Promise<void>((resolvePort, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolvePort())); });
}
async function waitForNext(child: ChildProcess) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, 'The isolated Next server stopped before becoming ready.');
    try { if ((await fetch('http://127.0.0.1:3011/', { redirect: 'manual', signal: AbortSignal.timeout(2000) })).status === 200) return; } catch { /* Not ready yet. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error('The isolated Next server did not become ready within 60 seconds.');
}
async function closeOwnedResources() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (proxy) { proxy.closeAllConnections(); await new Promise<void>(resolveClose => proxy!.close(() => resolveClose())); }
  for (const child of [...children]) await stopChild(child);
  if (replica) await replica.stop({ doCleanup: true, force: true });
  if (originalNextEnv) {
    const current = await readFile(resolve(root, 'next-env.d.ts'));
    if (!current.equals(originalNextEnv)) await writeFile(resolve(root, 'next-env.d.ts'), originalNextEnv);
  }
  // Only the UUID directory created by this invocation is removed; binaries remain cached.
  assert(runDirectory.startsWith(runRoot + sep), 'Refusing cleanup outside owned E2E runs.');
  await rm(runDirectory, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void closeOwnedResources().finally(() => process.exit(130)); });

let exitCode = 1;
try {
  const env = await isolatedEnvironment();
  await Promise.all([available(3010), available(3011)]);
  await mkdir(resolve(runDirectory, 'mongo'), { recursive: true });
  originalNextEnv = await readFile(resolve(root, 'next-env.d.ts'));
  // Pin the vendor binary and download/cache it only inside ignored test storage.
  for (const name of Object.keys(process.env)) if (name.startsWith('MONGOMS_')) delete process.env[name];
  process.env.MONGOMS_DOWNLOAD_DIR = resolve(root, '.local/e2e/mongodb');
  process.env.MONGOMS_VERSION = '8.2.6';
  process.env.MONGOMS_DOWNLOAD_MIRROR = 'https://fastdl.mongodb.org';
  const { MongoMemoryReplSet } = await import('mongodb-memory-server-core');
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.2.6', downloadDir: process.env.MONGOMS_DOWNLOAD_DIR }, instanceOpts: [{ dbPath: resolve(runDirectory, 'mongo') }], replSet: { count: 1, ip: '127.0.0.1', dbName: E2E_DATABASE, name: 'moe_e2e', storageEngine: 'wiredTiger' } });
  const uri = replica.getUri(E2E_DATABASE);
  env.MONGODB_URI = uri; env.MONGODB_DB_NAME = E2E_DATABASE;
  env.MOE_E2E_MONGODB_URI = uri;
  process.env.MOE_E2E_MONGODB_URI = uri; process.env.MOE_E2E_OWNER = owner;
  const client = await new MongoClient(uri).connect();
  try {
    const db = client.db(E2E_DATABASE);
    assert.equal((await db.listCollections({}, { nameOnly: true }).toArray()).length, 0, 'New replica set was not empty.');
    await db.collection<{ _id: string; owner: string }>('e2e_owner').insertOne({ _id: 'suite', owner });
    await seedE2eDatabase(db);
  } finally { await client.close(); }
  console.log('E2E: isolated loopback MongoDB seeded; real provider credentials disabled.');
  const buildCode = await completed(launch(['node_modules/next/dist/bin/next', 'build'], env));
  assert.equal(buildCode, 0, 'The isolated E2E production build failed.');
  await writeFile(resolve(root, 'next-env.d.ts'), originalNextEnv);
  const next = launch(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3011'], env);
  await waitForNext(next);
  const certificate = await generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048, algorithm: 'sha256', notAfterDate: new Date(Date.now() + 86400000), extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }] });
  proxy = createHttpsServer({ key: certificate.private, cert: certificate.cert }, (request, response) => {
    const upstream = httpRequest({ hostname: '127.0.0.1', port: 3011, path: request.url, method: request.method, headers: { ...request.headers, host: '127.0.0.1:3010', 'x-forwarded-host': '127.0.0.1:3010', 'x-forwarded-proto': 'https' } }, incoming => { response.writeHead(incoming.statusCode || 502, incoming.headers); incoming.pipe(response); });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Test proxy could not reach the isolated app.'); });
    request.pipe(upstream);
  });
  await new Promise<void>(resolveListen => proxy!.listen(3010, '127.0.0.1', resolveListen));
  console.log(`E2E: production app ready at ${E2E_BASE_URL}; running requested browser tests.`);
  exitCode = await completed(launch(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], env));
} catch (error) {
  console.error('E2E runner failed:', error instanceof Error ? error.message : 'Unknown error');
} finally {
  await closeOwnedResources();
  await mkdir(resolve(root, '.local/e2e'), { recursive: true });
  await writeFile(resolve(root, '.local/e2e/runner.log'), logLines.join(''), { mode: 0o600 });
  await writeFile(resolve(root, '.local/e2e/result.json'), JSON.stringify({ startedAt, completedAt: new Date().toISOString(), exitCode, database: E2E_DATABASE, baseURL: E2E_BASE_URL, distDir: '.next-e2e', liveProviderCredentialsUsed: false, ownedReplicaStopped: true, ownedRunDirectoryRemoved: true }, null, 2) + '\n', { mode: 0o600 });
  process.exitCode = exitCode;
}

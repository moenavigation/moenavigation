import assert from 'node:assert/strict';
import test from 'node:test';
import { Long, type Db } from 'mongodb';
import { getMongoDbUsage, parseMongoUsage, readMongoUsage } from '../src/server/usage-mongodb';

test('Mongo usage keeps whole-cluster logical storage separate from database disk allocation', () => {
  const result = parseMongoUsage({ ok: 1, atlasSize: 9000 }, { ok: 1, dataSize: 1000, indexSize: 200, storageSize: 64000, totalSize: 64200, objects: 3, collections: 2, scaleFactor: 1 });
  assert.deepEqual(result, { clusterBytes: 9000, databaseBytes: 1200, dataBytes: 1000, indexBytes: 200, documents: 3, collections: 2 });
});

test('zero is a measurement while omitted, invalid, failed, and scaled values remain unavailable', () => {
  assert.equal(parseMongoUsage({ ok: 1, atlasSize: 0 }, { ok: 1, dataSize: 0, indexSize: 0 }).databaseBytes, 0);
  assert.equal(parseMongoUsage({ ok: 1, atlasSize: 0 }, null).clusterBytes, 0);
  for (const invalid of [undefined, null, -1, NaN, Infinity, '12', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseMongoUsage({ ok: 1, atlasSize: invalid }, { ok: 1, dataSize: invalid, indexSize: 4 }).clusterBytes, null);
    assert.equal(parseMongoUsage(null, { ok: 1, dataSize: invalid, indexSize: 4 }).databaseBytes, null);
  }
  assert.equal(parseMongoUsage({ ok: 0, atlasSize: 10 }, null).clusterBytes, null);
  assert.equal(parseMongoUsage(null, { ok: 0, dataSize: 10, indexSize: 10 }).databaseBytes, null);
  assert.equal(parseMongoUsage(null, { ok: 1, scaleFactor: 1024, dataSize: 10, indexSize: 10 }).databaseBytes, null);
  assert.equal(parseMongoUsage(null, { ok: 1, dataSize: Number.MAX_SAFE_INTEGER, indexSize: 1 }).databaseBytes, null);
});

test('BSON integers are accepted only when they can be represented without losing precision', () => {
  assert.equal(parseMongoUsage({ ok: 1, atlasSize: Long.fromNumber(2048) }, null).clusterBytes, 2048);
  assert.equal(parseMongoUsage({ ok: 1, atlasSize: Long.fromString('9007199254740992') }, null).clusterBytes, null);
  assert.equal(parseMongoUsage({ ok: 1, atlasSize: Long.fromNumber(-1) }, null).clusterBytes, null);
});

test('unsupported cluster statistics retain measured database storage and redact provider errors', async () => {
  const calls: { command: unknown; options: { timeoutMS: number; signal: AbortSignal } }[] = [];
  const result = await readMongoUsage(async () => ({ command: async (command: Record<string, unknown>, options: { timeoutMS: number; signal: AbortSignal }) => {
    calls.push({ command, options });
    if (command.atlasSize) throw new Error('private-host.example credentials=secret');
    return { ok: 1, dataSize: 10, indexSize: 5 };
  } }) as unknown as Pick<Db, 'command'>);
  assert.equal(result.clusterAvailable, false);
  assert.equal(result.databaseAvailable, true);
  assert.equal(result.readings.clusterBytes, null);
  assert.equal(result.readings.databaseBytes, 15);
  assert.deepEqual(calls.map(({ command, options }) => ({ command, options: { timeoutMS: options.timeoutMS } })), [
    { command: { atlasSize: 1, maxTimeMS: 4000 }, options: { timeoutMS: 5000 } },
    { command: { dbStats: 1, scale: 1, maxTimeMS: 4000 }, options: { timeoutMS: 5000 } },
  ]);
  assert(calls.every(call => call.options.signal instanceof AbortSignal));
  assert.doesNotMatch(JSON.stringify(result), /private-host|secret|credentials/);
});

test('connection deadlines return promptly and cannot start delayed database commands', async () => {
  let finishConnection!: (db: Pick<Db, 'command'>) => void;
  let commandCalls = 0;
  const pending = new Promise<Pick<Db, 'command'>>(resolve => { finishConnection = resolve; });
  const result = await readMongoUsage(() => pending, 10);
  assert.equal(result.clusterAvailable, false);
  assert.equal(result.databaseAvailable, false);
  finishConnection({ command: async () => { commandCalls += 1; return { ok: 1 }; } } as unknown as Pick<Db, 'command'>);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(commandCalls, 0);
});

test('the overall deadline retains a completed measurement if the other command stalls', async () => {
  const result = await readMongoUsage(async () => ({ command: async (command: Record<string, unknown>) => {
    if (command.atlasSize) return { ok: 1, atlasSize: 44 };
    return new Promise(() => {});
  } }) as unknown as Pick<Db, 'command'>, 10);
  assert.equal(result.clusterAvailable, true);
  assert.equal(result.readings.clusterBytes, 44);
  assert.equal(result.databaseAvailable, false);
});

test('a failed database read cannot erase a successful cluster measurement', async () => {
  const result = await readMongoUsage(async () => ({ command: async (command: Record<string, unknown>) => {
    if (command.dbStats) throw new Error('denied');
    return { ok: 1, atlasSize: 100 };
  } }) as unknown as Pick<Db, 'command'>);
  assert.equal(result.clusterAvailable, true);
  assert.equal(result.databaseAvailable, false);
  assert.equal(result.readings.clusterBytes, 100);
  assert.equal(result.readings.databaseBytes, null);
});

test('connection failures expose no diagnostics or fabricated zero readings', async () => {
  const result = await readMongoUsage(async () => { throw new Error('mongodb://user:secret@private-host/production'); });
  assert.deepEqual(result, { readings: { clusterBytes: null, databaseBytes: null, dataBytes: null, indexBytes: null, documents: null, collections: null }, clusterAvailable: false, databaseAvailable: false });
});

test('the public provider DTO does not infer a plan, limits, or network usage from storage', async () => {
  const provider = await getMongoDbUsage({ configured: true, now: () => new Date('2026-10-30T00:00:00Z'), getDatabase: async () => ({ command: async (command: Record<string, unknown>) => command.atlasSize ? { ok: 1, atlasSize: 512 } : { ok: 1, dataSize: 100, indexSize: 12, db: 'private-database' } }) as unknown as Pick<Db, 'command'> });
  assert.equal(provider.status, 'partial');
  assert.equal(provider.checkedAt, '2026-10-30T00:00:00.000Z');
  assert.equal(provider.plan, undefined);
  assert.deepEqual(provider.metrics.map(({ key, used, limit, scope, period }) => ({ key, used, limit, scope, period })), [
    { key: 'cluster_storage', used: 512, limit: null, scope: 'cluster', period: 'current' },
    { key: 'database_storage', used: 112, limit: null, scope: 'database', period: 'current' },
    { key: 'data_transfer', used: null, limit: null, scope: 'cluster', period: 'unknown' },
  ]);
  assert.doesNotMatch(JSON.stringify(provider), /private-database/);
});

test('unconfigured usage makes no database requests and distinguishes it from a failed connection', async () => {
  let calls = 0;
  const getDatabase = async () => { calls += 1; throw new Error('secret'); };
  const unconfigured = await getMongoDbUsage({ configured: false, getDatabase });
  assert.equal(unconfigured.status, 'not_configured');
  assert.equal(calls, 0);
  const unavailable = await getMongoDbUsage({ configured: true, getDatabase });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(calls, 1);
  for (const provider of [unconfigured, unavailable]) {
    assert(provider.metrics.every(metric => metric.used === null && metric.limit === null));
    assert.doesNotMatch(JSON.stringify(provider), /secret/);
  }
});

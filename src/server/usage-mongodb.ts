import 'server-only';
import { Long, type Db } from 'mongodb';
import type { UsageProvider } from '@/lib/cms-usage';
import { getDb } from './db';

export type MongoUsageReadings = {
  clusterBytes: number | null;
  databaseBytes: number | null;
  dataBytes: number | null;
  indexBytes: number | null;
  documents: number | null;
  collections: number | null;
};

const emptyReadings = (): MongoUsageReadings => ({ clusterBytes: null, databaseBytes: null, dataBytes: null, indexBytes: null, documents: null, collections: null });

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown): number | null {
  if (value instanceof Long) {
    const exact = value.toBigInt();
    if (exact < BigInt(0) || exact > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(exact);
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Keep cluster totals separate from this database; disk allocation is not logical usage. */
export function parseMongoUsage(atlasResult: unknown, databaseResult: unknown): MongoUsageReadings {
  const readings = emptyReadings();
  const atlas = object(atlasResult);
  const database = object(databaseResult);
  // atlasSize is documented for both Free and Flex, so its presence does not identify a plan.
  // https://www.mongodb.com/docs/atlas/free-tier-commands/
  if (atlas.ok === 1) readings.clusterBytes = count(atlas.atlasSize);
  if (database.ok === 1) {
    readings.documents = count(database.objects);
    readings.collections = count(database.collections);
    if (database.scaleFactor === undefined || database.scaleFactor === 1) {
      readings.dataBytes = count(database.dataSize);
      readings.indexBytes = count(database.indexSize);
      if (readings.dataBytes !== null && readings.indexBytes !== null) readings.databaseBytes = count(readings.dataBytes + readings.indexBytes);
    }
  }
  return readings;
}

export type MongoUsageReadResult = { readings: MongoUsageReadings; clusterAvailable: boolean; databaseAvailable: boolean };

/** Only metadata commands: no collection reads, index initialization, or database writes. */
export async function readMongoUsage(getDatabase: () => Promise<Pick<Db, 'command'>> = getDb, deadlineMS = 6000): Promise<MongoUsageReadResult> {
  const controller = new AbortController();
  let atlasResult: unknown = null;
  let databaseResult: unknown = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Usage read timed out.')); }, deadlineMS);
  });
  try {
    await Promise.race([
      (async () => {
        const db = await getDatabase();
        // Initial connection/DNS can precede the driver's command timeout.
        controller.signal.throwIfAborted();
        const options = { timeoutMS: 5000, signal: controller.signal };
        await Promise.allSettled([
          db.command({ atlasSize: 1, maxTimeMS: 4000 }, options).then(value => { atlasResult = value; }),
          db.command({ dbStats: 1, scale: 1, maxTimeMS: 4000 }, options).then(value => { databaseResult = value; }),
        ]);
      })(),
      deadline,
    ]);
  } catch {
    // Never expose driver messages: they can include connection strings and private hostnames.
  } finally {
    clearTimeout(timer);
  }
  const readings = parseMongoUsage(atlasResult, databaseResult);
  return { readings, clusterAvailable: readings.clusterBytes !== null, databaseAvailable: readings.databaseBytes !== null };
}

type MongoUsageOptions = { getDatabase?: () => Promise<Pick<Db, 'command'>>; configured?: boolean; now?: () => Date };

export async function getMongoDbUsage(options: MongoUsageOptions = {}): Promise<UsageProvider> {
  const configured = options.configured ?? Boolean(process.env.MONGODB_URI && process.env.MONGODB_DB_NAME);
  const result = configured ? await readMongoUsage(options.getDatabase) : { readings: emptyReadings(), clusterAvailable: false, databaseAvailable: false };
  const available = result.clusterAvailable || result.databaseAvailable;
  return {
    id: 'mongodb', name: 'MongoDB',
    // The database connection cannot provide the provider's rolling network usage.
    status: !configured ? 'not_configured' : available ? 'partial' : 'unavailable',
    checkedAt: (options.now?.() ?? new Date()).toISOString(),
    dashboardUrl: 'https://cloud.mongodb.com/',
    metrics: [
      { key: 'cluster_storage', label: 'Cluster storage', used: result.readings.clusterBytes, limit: null, unit: 'bytes', scope: 'cluster', period: 'current', note: result.clusterAvailable ? 'All databases on this cluster, including data and indexes.' : 'Cluster storage is unavailable with this connection. Check Atlas for the total.' },
      { key: 'database_storage', label: 'This database', used: result.readings.databaseBytes, limit: null, unit: 'bytes', scope: 'database', period: 'current', note: 'This project database only, including uncompressed data and indexes.' },
      { key: 'data_transfer', label: 'Data transfer', used: null, limit: null, unit: 'bytes', scope: 'cluster', period: 'unknown', note: 'Check Atlas for network usage and limits.' },
    ],
    ...(!configured ? { message: 'MongoDB usage is not configured.' } : !available ? { message: 'MongoDB usage is unavailable. Try again later or open Atlas.' } : {}),
  };
}

import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { usageProviderIds, type UsageOverview, type UsageProvider, type UsageProviderId, type UsageSettings } from '@/lib/cms-usage';
import { collections, ensureIndexes, getDb, transaction, type UserDocument } from './db';
import { getCloudinaryUsage } from './usage-cloudinary';
import { getMongoDbUsage } from './usage-mongodb';
import { fetchVercelUsage } from './usage-vercel';
import { appendAuditEvent, auditActor } from './audit';
import { HttpError } from './http';
import { resolveCmsRole } from '@/lib/cms-roles';

const CACHE_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const date = z.string().date();
const readingSchema = z.strictObject({ transferBytes: z.number().finite().nonnegative().max(1e18).nullable(), requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), periodLabel: z.string().trim().min(1).max(120) }).refine(value => value.transferBytes !== null || value.requests !== null, 'Enter at least one usage reading.');
const allowanceSchema = z.strictObject({ provider: z.enum(usageProviderIds), metric: z.string().min(1).max(140).regex(/^[a-zA-Z0-9:_-]+$/), limit: z.number().finite().nonnegative().max(1e18), unit: z.string().trim().min(1).max(40) });
export const usageSettingsInput = z.strictObject({
  expectedRevision: z.number().int().nonnegative(), allowances: z.array(allowanceSchema).max(30),
  vercelWindow: z.strictObject({ start: date, end: date }).nullable(), vercelReading: readingSchema.nullable(),
  readingUpdated: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  const keys = value.allowances.map(item => `${item.provider}:${item.metric}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: ['allowances'], message: 'Use one allowance for each metric.' });
  if (value.vercelWindow) {
    const maximum = new Date(value.vercelWindow.start); maximum.setUTCFullYear(maximum.getUTCFullYear() + 1);
    if (value.vercelWindow.start >= value.vercelWindow.end || Date.parse(value.vercelWindow.end) > maximum.getTime()) context.addIssue({ code: 'custom', path: ['vercelWindow'], message: 'Choose a reporting period of up to one year.' });
  }
  if (value.allowances.some(item => item.provider === 'vercel' && item.metric.startsWith('sku:')) && !value.vercelWindow) context.addIssue({ code: 'custom', path: ['vercelWindow'], message: 'Set the matching Vercel reporting dates before adding allowances.' });
});

export function defaultUsageSettings(): UsageSettings {
  return { revision: 0, allowances: [
    { provider: 'mongodb', metric: 'cluster_storage', limit: 512 * 1024 * 1024, unit: 'bytes' },
    { provider: 'vercel', metric: 'fast_data_transfer', limit: 100 * 1e9, unit: 'bytes' },
    { provider: 'vercel', metric: 'cdn_requests', limit: 1e6, unit: 'count' },
  ], vercelWindow: null, vercelReading: null };
}
export async function readUsageSettings(): Promise<UsageSettings> {
  const row = await collections(await getDb()).state.findOne({ _id: 'usage:settings' });
  if (!row?.value) return defaultUsageSettings();
  try { return JSON.parse(row.value) as UsageSettings; } catch { return defaultUsageSettings(); }
}

export async function saveUsageSettings(input: z.infer<typeof usageSettingsInput>, actor: UserDocument): Promise<UsageSettings> {
  return transaction(async (db, session) => {
    const c = collections(db);
    await c.state.updateOne({ _id: 'admin-users-lock' }, { $inc: { count: 1 } }, { session, upsert: true });
    const current = await c.users.findOne({ _id: actor._id, passwordVersion: actor.passwordVersion, deletedAt: { $exists: false }, purgeAt: { $exists: false } }, { session });
    if (!current) throw new HttpError(401, 'Please sign in to continue.');
    if (!['Dev', 'Admin'].includes(resolveCmsRole(current.role))) throw new HttpError(403, 'Only Dev and Admin can manage monitoring settings.');
    await c.state.updateOne({ _id: 'usage:settings-lock' }, { $inc: { count: 1 } }, { session, upsert: true });
    const row = await c.state.findOne({ _id: 'usage:settings' }, { session });
    const revision = row?.count ?? 0;
    if (revision !== input.expectedRevision) throw new HttpError(409, 'Monitoring settings changed elsewhere. Refresh and try again.');
    let previous: UsageSettings | null = null;
    try { if (row?.value) previous = JSON.parse(row.value) as UsageSettings; } catch { /* Replace unreadable monitoring settings safely. */ }
    const sameReading = input.vercelReading && previous?.vercelReading && input.vercelReading.transferBytes === previous.vercelReading.transferBytes && input.vercelReading.requests === previous.vercelReading.requests && input.vercelReading.periodLabel === previous.vercelReading.periodLabel;
    const recordedAt = sameReading && !input.readingUpdated ? previous!.vercelReading!.recordedAt : new Date().toISOString();
    const result: UsageSettings = { revision: revision + 1, allowances: input.allowances, vercelWindow: input.vercelWindow, vercelReading: input.vercelReading ? { ...input.vercelReading, recordedAt } : null };
    await c.state.updateOne({ _id: 'usage:settings' }, { $set: { count: result.revision, value: JSON.stringify(result) } }, { session, upsert: true });
    await appendAuditEvent(db, session, { action: 'settings.usage_updated', actor: auditActor(current), target: { type: 'Settings', id: 'usage' } });
    return result;
  });
}

function manualVercel(settings: UsageSettings): UsageProvider {
  const reading = settings.vercelReading;
  return { id: 'vercel', name: 'Vercel', status: reading ? 'ready' : 'not_configured', plan: 'Current plan', checkedAt: reading?.recordedAt ?? new Date().toISOString(), dashboardUrl: 'https://vercel.com/dashboard',
    message: reading ? 'Dashboard reading. Update these values from the provider dashboard when needed.' : 'Add the usage shown in your Vercel dashboard to see the remaining allowance.',
    metrics: [
      { key: 'fast_data_transfer', label: 'Fast Data Transfer', used: reading?.transferBytes ?? null, limit: null, unit: 'bytes', scope: 'team', period: 'unknown', note: reading?.periodLabel ?? 'Provider dashboard reporting window' },
      { key: 'cdn_requests', label: 'CDN Requests', used: reading?.requests ?? null, limit: null, unit: 'count', scope: 'team', period: 'unknown', note: reading?.periodLabel ?? 'Provider dashboard reporting window' },
    ] };
}
function applyAllowances(provider: UsageProvider, settings: UsageSettings): UsageProvider {
  return { ...provider, plan: provider.plan ? 'Current plan' : undefined, metrics: provider.metrics.map(metric => {
    const allowance = settings.allowances.find(item => item.provider === provider.id && item.metric === metric.key && item.unit === metric.unit);
    return metric.limit === null && allowance ? { ...metric, limit: allowance.limit, allowanceSource: 'configured' as const } : metric;
  }) };
}

type Cache = { provider: UsageProvider; window: string; nextCheckAt: number };
function cacheScope(id: UsageProviderId, settings: UsageSettings, includeWindow = true) {
  const config = id === 'vercel' ? [process.env.VERCEL_USAGE_TEAM_ID, process.env.VERCEL_USAGE_TOKEN, includeWindow ? settings.vercelWindow : null]
    : id === 'mongodb' ? [process.env.MONGODB_URI, process.env.MONGODB_DB_NAME]
    : [process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET];
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 24);
}
async function providerSnapshot(id: UsageProviderId, settings: UsageSettings, force: boolean, checked: () => void): Promise<UsageProvider> {
  if (id === 'vercel' && (settings.vercelReading || !process.env.VERCEL_USAGE_TOKEN || !process.env.VERCEL_USAGE_TEAM_ID)) return applyAllowances(manualVercel(settings), settings);
  const c = collections(await getDb());
  const scope = cacheScope(id, settings);
  const key = `usage:cache:${id}:${scope}`;
  const row = await c.state.findOne({ _id: key });
  let cached: Cache | null = null;
  try { if (row?.value) cached = JSON.parse(row.value) as Cache; } catch { /* Refresh an unreadable cache. */ }
  const window = scope;
  const now = Date.now();
  if (cached?.window === window && cached.nextCheckAt > now && !force) return applyAllowances(cached.provider, settings);
  const owner = randomUUID();
  let acquired = false;
  try {
    const claim = await c.state.findOneAndUpdate({ _id: `usage:lease:${id}:${cacheScope(id, settings, false)}`, $or: [{ expiresAt: { $lte: new Date(now) } }, { expiresAt: { $exists: false } }] }, { $set: { value: owner, expiresAt: new Date(now + COOLDOWN_MS) } }, { upsert: true, returnDocument: 'after' });
    acquired = claim?.value === owner;
  } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  if (!acquired) {
    if (cached?.window === window) return applyAllowances(cached.provider, settings);
    return { id, name: id === 'mongodb' ? 'MongoDB' : id === 'cloudinary' ? 'Cloudinary' : 'Vercel', status: 'partial', metrics: [], checkedAt: new Date().toISOString(), dashboardUrl: id === 'mongodb' ? 'https://cloud.mongodb.com/' : id === 'cloudinary' ? 'https://console.cloudinary.com/' : 'https://vercel.com/dashboard', message: 'A usage check is already in progress. Refresh again shortly.' };
  }
  let snapshot: UsageProvider;
  checked();
  try { snapshot = await (id === 'mongodb' ? getMongoDbUsage() : id === 'cloudinary' ? getCloudinaryUsage() : fetchVercelUsage(settings.vercelWindow)); }
  catch { snapshot = { id, name: id === 'mongodb' ? 'MongoDB' : id === 'cloudinary' ? 'Cloudinary' : 'Vercel', status: 'unavailable', metrics: [], checkedAt: new Date().toISOString(), dashboardUrl: id === 'mongodb' ? 'https://cloud.mongodb.com/' : id === 'cloudinary' ? 'https://console.cloudinary.com/' : 'https://vercel.com/dashboard', message: 'Usage could not be checked. Try again later.' }; }
  const checkFailed = snapshot.status === 'unavailable';
  if (checkFailed && cached?.window === window && cached.provider.metrics.some(metric => metric.used !== null)) snapshot = { ...cached.provider, status: 'partial', message: 'The latest check failed. Showing the previous successful reading.' };
  const value: Cache = { provider: snapshot, window, nextCheckAt: now + (checkFailed ? COOLDOWN_MS : CACHE_MS) };
  await c.state.updateOne({ _id: key }, { $set: { value: JSON.stringify(value), expiresAt: new Date(now + 7 * 86400000) } }, { upsert: true });
  return applyAllowances(snapshot, settings);
}

export async function getUsageOverview(force = false): Promise<UsageOverview> {
  await ensureIndexes();
  const settings = await readUsageSettings();
  const c = collections(await getDb());
  let refreshed = false;
  const snapshots = await Promise.allSettled(usageProviderIds.map(id => providerSnapshot(id, settings, force, () => { refreshed = true; })));
  const providers = snapshots.map((result, index): UsageProvider => result.status === 'fulfilled' ? result.value : { id: usageProviderIds[index], name: ['Vercel', 'MongoDB', 'Cloudinary'][index], status: 'unavailable', metrics: [], checkedAt: new Date().toISOString(), dashboardUrl: ['https://vercel.com/dashboard', 'https://cloud.mongodb.com/', 'https://console.cloudinary.com/'][index], message: 'Usage could not be checked. Try again later.' });
  const leases = await c.state.find({ _id: { $in: usageProviderIds.map(id => `usage:lease:${id}:${cacheScope(id, settings, false)}`) } }).toArray();
  const next = Math.max(Date.now(), ...leases.map(row => row.expiresAt?.getTime() ?? 0));
  return { providers, settings, nextRefreshAt: new Date(next).toISOString(), refreshed };
}

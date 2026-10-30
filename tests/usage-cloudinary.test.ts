import assert from 'node:assert/strict';
import test from 'node:test';
import { getCloudinaryUsage, normalizeCloudinaryUsage } from '../src/server/usage-cloudinary';

const now = new Date('2026-10-30T15:00:00Z');
const env = { CLOUDINARY_CLOUD_NAME: 'unit-cloud', CLOUDINARY_API_KEY: 'unit-key', CLOUDINARY_API_SECRET: 'unit-secret' };
const report = { plan: 'Free', last_updated: '2026-10-30', credits: { usage: 1.5, limit: 17 }, storage: { usage: 1024, limit: 9999, credits_usage: 0.25 }, bandwidth: { usage: 2048, limit: 9999, credits_usage: 0.5 }, transformations: { usage: 750, limit: 9999, credits_usage: 0.75 }, resources: 12 };

test('shared credits use only the actual allowance and suppress independent resource caps', () => {
  const result = normalizeCloudinaryUsage(report, now);
  assert.equal(result.status, 'ready');
  assert.equal(result.plan, 'Current plan');
  assert.equal(JSON.stringify(result).includes('Free'), false);
  assert.equal(result.reportedAt, '2026-10-30T00:00:00.000Z');
  assert.deepEqual(result.metrics.find(item => item.key === 'credits') && { used: result.metrics[0].used, limit: result.metrics[0].limit, unit: result.metrics[0].unit }, { used: 1.5, limit: 17, unit: 'credits' });
  for (const key of ['storage', 'bandwidth', 'transformations']) assert.equal(result.metrics.find(item => item.key === key)?.limit, null);
  assert.equal(result.metrics.find(item => item.key === 'storage')?.period, 'current');
  assert.equal(result.metrics.find(item => item.key === 'bandwidth')?.period, 'rolling_30_days');
  assert.ok(result.metrics.every(item => item.scope === 'environment'));
  assert.equal(result.metrics.find(item => item.key === 'storage_credits')?.used, 0.25);
  assert.equal(result.metrics.find(item => item.key === 'storage_credits')?.limit, null);
  assert.equal(result.window, undefined);
});

test('missing quotas, totals, and provider fields remain unknown rather than becoming zero or a Free-plan guess', () => {
  const missing = normalizeCloudinaryUsage({ plan: 'Free', storage: { usage: 0 }, bandwidth: {}, transformations: {} }, now);
  assert.equal(missing.status, 'partial');
  assert.equal(missing.metrics.find(item => item.key === 'credits')?.used, null);
  assert.equal(missing.metrics.find(item => item.key === 'credits')?.limit, null);
  assert.equal(missing.metrics.find(item => item.key === 'storage')?.used, 0);
  assert.equal(missing.metrics.find(item => item.key === 'bandwidth')?.used, null);
  assert.equal(normalizeCloudinaryUsage({ unexpected: true }, now).status, 'unavailable');
  assert.equal(normalizeCloudinaryUsage(null, now).status, 'unavailable');
  const noCreditTotal = normalizeCloudinaryUsage({ storage: { usage: 1024, credits_usage: 0.3 }, bandwidth: { usage: 0, credits_usage: 0 }, transformations: { usage: 0, credits_usage: 0 } }, now);
  assert.equal(noCreditTotal.metrics.find(item => item.key === 'credits')?.used, null);
});

test('legacy API resource limits are retained only when no shared-credit model is reported', () => {
  const legacy = normalizeCloudinaryUsage({ plan: 'Basic', storage: { usage: 30, limit: 100 }, bandwidth: { usage: 40, limit: 200 }, transformations: { usage: 5, limit: 10 } }, now);
  assert.equal(legacy.status, 'ready');
  assert.equal(legacy.metrics.find(item => item.key === 'credits'), undefined);
  assert.deepEqual(legacy.metrics.map(item => item.limit), [100, 200, 10]);
});

test('malformed numeric values, arbitrary provider fields, and unrecognized plan text are not exposed', () => {
  const result = normalizeCloudinaryUsage({ ...report, plan: 'private-account-token', last_updated: 'invalid secret', api_key: 'private-key', error: { message: 'private-message' }, credits: { usage: 0, limit: '25' }, storage: { usage: -1 }, bandwidth: { usage: Infinity }, transformations: { usage: NaN } }, now);
  assert.equal(result.status, 'partial');
  assert.equal(result.plan, undefined);
  assert.equal(result.reportedAt, undefined);
  assert.equal(result.metrics[0].used, 0);
  assert.equal(result.metrics[0].limit, null);
  for (const key of ['storage', 'bandwidth', 'transformations']) assert.equal(result.metrics.find(item => item.key === key)?.used, null);
  assert.equal(JSON.stringify(result).includes('private-'), false);
});

test('the adapter makes one bounded fixed-origin read without mutating SDK configuration', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.cloudinary.com/v1_1/unit-cloud/usage');
    assert.equal(options?.method, 'GET');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    assert.ok(options?.signal);
    assert.equal(new Headers(options?.headers).get('Authorization'), `Basic ${Buffer.from('unit-key:unit-secret').toString('base64')}`);
    return Response.json(report, { headers: { 'x-featureratelimit-limit': '500', 'x-featureratelimit-remaining': '497', 'x-featureratelimit-reset': 'Fri, 30 Oct 2026 16:00:00 GMT' } });
  };
  const result = await getCloudinaryUsage({ env, fetcher, now: () => now });
  assert.equal(calls, 1);
  const admin = result.metrics.find(item => item.key === 'admin_requests');
  assert.equal(admin?.used, 3);
  assert.equal(admin?.limit, 500);
  assert.equal(admin?.period, 'hourly');
  assert.equal(admin?.resetAt, '2026-10-30T16:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('unit-secret'), false);
});

test('missing configuration never makes a network call', async () => {
  const result = await getCloudinaryUsage({ env: {}, fetcher: async () => { throw new Error('Must not fetch'); }, now: () => now });
  assert.equal(result.status, 'not_configured');
  assert.deepEqual(result.metrics, []);
});

test('invalid configuration cannot change the authenticated request destination', async () => {
  let called = false;
  const result = await getCloudinaryUsage({ env: { ...env, CLOUDINARY_CLOUD_NAME: '../../other/usage?redirect=private' }, fetcher: async () => { called = true; throw new Error('Must not fetch'); }, now: () => now });
  assert.equal(called, false);
  assert.equal(result.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('zero allowances remain zero, invalid reporting dates disappear, and inconsistent API headers cannot produce negative usage', async () => {
  const result = await getCloudinaryUsage({ env, now: () => now, fetcher: async () => Response.json({ ...report, last_updated: '2026-02-30', credits: { usage: 0, limit: 0 } }, { headers: { 'x-featureratelimit-limit': '10', 'x-featureratelimit-remaining': '11', 'x-featureratelimit-reset': 'private-invalid' } }) });
  assert.equal(result.status, 'ready');
  assert.equal(result.metrics.find(item => item.key === 'credits')?.limit, 0);
  assert.equal(result.reportedAt, undefined);
  const admin = result.metrics.find(item => item.key === 'admin_requests');
  assert.equal(admin?.used, null);
  assert.equal(admin?.limit, 10);
  assert.equal(admin?.resetAt, undefined);
});

test('provider HTTP errors, thrown errors, malformed JSON, and oversized bodies return only safe failures', async () => {
  for (const fetcher of [
    async () => new Response('private secret', { status: 401 }),
    async () => new Response('private secret', { status: 420 }),
    async () => new Response('private secret', { status: 500 }),
    async () => { throw new Error('private secret'); },
    async () => new Response('private secret'),
    async () => new Response('x'.repeat(256 * 1024 + 1)),
    async () => new Response('{}', { headers: { 'content-length': '9999999' } }),
  ] as (typeof fetch)[]) {
    const result = await getCloudinaryUsage({ env, fetcher, now: () => now });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.metrics, []);
    assert.equal(JSON.stringify(result).includes('private secret'), false);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { usageBalance } from '../src/lib/cms-usage';
import { defaultUsageSettings, usageSettingsInput } from '../src/server/usage';

const input = () => ({ expectedRevision: 0, allowances: [], vercelWindow: null, vercelReading: null });

test('unknown or invalid usage does not become zero or suggest an available allowance', () => {
  for (const missing of [null, NaN, Infinity, -Infinity, -1]) {
    assert.deepEqual(usageBalance(missing, 100), { remaining: null, exceeded: null, percent: null });
    assert.deepEqual(usageBalance(20, missing), { remaining: null, exceeded: null, percent: null });
  }
  assert.deepEqual(usageBalance(null, 0), { remaining: null, exceeded: null, percent: null });
});

test('usage balance distinguishes unused, exhausted, exceeded, and zero allowances', () => {
  assert.deepEqual(usageBalance(0, 100), { remaining: 100, exceeded: 0, percent: 0 });
  assert.deepEqual(usageBalance(100, 100), { remaining: 0, exceeded: 0, percent: 100 });
  assert.deepEqual(usageBalance(150, 100), { remaining: 0, exceeded: 50, percent: 150 });
  assert.deepEqual(usageBalance(0, 0), { remaining: 0, exceeded: 0, percent: 0 });
  assert.deepEqual(usageBalance(1, 0), { remaining: 0, exceeded: 1, percent: 100 });
  assert.deepEqual(usageBalance(1.25, 5), { remaining: 3.75, exceeded: 0, percent: 25 });
});

test('extreme finite allowances cannot produce an infinite display percentage', () => {
  const result = usageBalance(1e18, 1e-300);
  assert.deepEqual(result, { remaining: 0, exceeded: 1e18, percent: null });
});

test('default settings separate the confirmed cluster allowance from unknown provider readings', () => {
  const defaults = defaultUsageSettings();
  assert.equal(defaults.revision, 0);
  assert.equal(defaults.vercelReading, null);
  assert.equal(defaults.vercelWindow, null);
  assert.deepEqual(defaults.allowances, [
    { provider: 'mongodb', metric: 'cluster_storage', limit: 512 * 1024 * 1024, unit: 'bytes' },
    { provider: 'vercel', metric: 'fast_data_transfer', limit: 100 * 1e9, unit: 'bytes' },
    { provider: 'vercel', metric: 'cdn_requests', limit: 1e6, unit: 'count' },
  ]);
  assert(!defaults.allowances.some(allowance => allowance.provider === 'cloudinary' || allowance.metric === 'database_storage'));
  defaults.allowances[0].limit = 0;
  assert.equal(defaultUsageSettings().allowances[0].limit, 512 * 1024 * 1024);
});

test('manual readings preserve zero, allow one unknown metric, and reject two missing metrics', () => {
  for (const reading of [
    { transferBytes: 0, requests: null, periodLabel: 'Current billing period' },
    { transferBytes: null, requests: 0, periodLabel: 'Current billing period' },
    { transferBytes: 12.5, requests: 3, periodLabel: '  October 2026  ' },
  ]) {
    const parsed = usageSettingsInput.parse({ ...input(), vercelReading: reading });
    assert.equal(parsed.vercelReading?.transferBytes, reading.transferBytes);
    assert.equal(parsed.vercelReading?.requests, reading.requests);
    assert.equal(parsed.vercelReading?.periodLabel, reading.periodLabel.trim());
  }
  assert(usageSettingsInput.safeParse(input()).success);
  assert(!usageSettingsInput.safeParse({ ...input(), vercelReading: { transferBytes: null, requests: null, periodLabel: 'October' } }).success);
  assert(!usageSettingsInput.safeParse({ ...input(), vercelReading: { transferBytes: 1, requests: 1, periodLabel: 'October', recordedAt: '2020-01-01T00:00:00.000Z' } }).success);
});

test('manual readings reject invalid counts, non-finite bytes, empty periods, and unexpected fields', () => {
  const reading = { transferBytes: 5, requests: 5, periodLabel: 'Current billing period' };
  for (const requests of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert(!usageSettingsInput.safeParse({ ...input(), vercelReading: { ...reading, requests } }).success);
  for (const transferBytes of [-1, NaN, Infinity, 1e19]) assert(!usageSettingsInput.safeParse({ ...input(), vercelReading: { ...reading, transferBytes } }).success);
  assert(!usageSettingsInput.safeParse({ ...input(), vercelReading: { ...reading, periodLabel: '  ' } }).success);
  assert(!usageSettingsInput.safeParse({ ...input(), providerToken: 'must-stay-out-of-settings' }).success);
});

test('allowances accept zero but reject duplicate metrics and require dates for API resource allowances', () => {
  const allowance = { provider: 'mongodb', metric: 'cluster_storage', limit: 0, unit: 'bytes' };
  assert(usageSettingsInput.safeParse({ ...input(), allowances: [allowance] }).success);
  assert(!usageSettingsInput.safeParse({ ...input(), allowances: [allowance, allowance] }).success);
  for (const limit of [-1, NaN, Infinity, 1e19]) assert(!usageSettingsInput.safeParse({ ...input(), allowances: [{ ...allowance, limit }] }).success);
  const apiAllowance = { provider: 'vercel', metric: 'sku:abc123', limit: 100, unit: 'bytes' };
  assert(!usageSettingsInput.safeParse({ ...input(), allowances: [apiAllowance] }).success);
  assert(usageSettingsInput.safeParse({ ...input(), allowances: [apiAllowance], vercelWindow: { start: '2026-10-01', end: '2026-11-01' } }).success);
});

test('reporting windows use the same calendar-year boundary as the Vercel adapter', () => {
  for (const vercelWindow of [
    { start: '2026-01-01', end: '2027-01-01' },
    { start: '2024-01-01', end: '2025-01-01' },
  ]) assert(usageSettingsInput.safeParse({ ...input(), vercelWindow }).success);
  for (const vercelWindow of [
    { start: '2026-01-01', end: '2027-01-02' },
    { start: '2024-01-01', end: '2025-01-02' },
    { start: '2026-10-30', end: '2026-10-30' },
    { start: '2026-10-31', end: '2026-10-30' },
    { start: '2026-02-30', end: '2026-03-01' },
  ]) assert(!usageSettingsInput.safeParse({ ...input(), vercelWindow }).success, `${vercelWindow.start} to ${vercelWindow.end}`);
});

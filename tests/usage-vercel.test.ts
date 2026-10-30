import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchVercelUsage } from '../src/server/usage-vercel';

const now = () => new Date('2026-10-30T08:45:20.000Z');
const config = { token: 'unit-test-private-token', teamId: 'team_fixture', now };
const row = (extra: Record<string, unknown> = {}) => ({ ChargeCategory: 'Usage', SkuId: 'fast-data-transfer', ServiceName: 'Fast Data Transfer', ConsumedQuantity: '1.25', ConsumedUnit: 'GB', ...extra });
const jsonl = (rows: unknown[]) => rows.map(item => JSON.stringify(item)).join('\n');
const fetchBody = (body: BodyInit | null, init?: ResponseInit): typeof fetch => async () => new Response(body, init);
const read = (rows: unknown[]) => fetchVercelUsage(null, { ...config, fetch: fetchBody(jsonl(rows)) });

test('missing Vercel credentials never contacts the provider or fabricates readings', async () => {
  for (const missing of [{ token: '', teamId: 'team_test' }, { token: 'test', teamId: ' ' }]) {
    const result = await fetchVercelUsage(null, { ...config, ...missing, fetch: async () => { assert.fail('Provider must not be called.'); } });
    assert.equal(result.status, 'not_configured');
    assert.deepEqual(result.metrics, []);
    assert.doesNotMatch(JSON.stringify(result), /unit-test-private-token|team_test/);
  }
});

test('Vercel requests use the documented team endpoint and an explicitly labelled calendar window', async () => {
  let calls = 0;
  const result = await fetchVercelUsage(null, { ...config, fetch: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.vercel.com');
    assert.equal(url.pathname, '/v1/billing/charges');
    assert.deepEqual(Object.fromEntries(url.searchParams), { teamId: 'team_fixture', from: '2026-10-01T00:00:00.000Z', to: now().toISOString() });
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${config.token}`);
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    return new Response(jsonl([row()]));
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ready');
  assert.equal(result.window?.label, 'Calendar month to date (UTC)');
  assert.equal(result.checkedAt, now().toISOString());
  assert.equal(result.reportedAt, undefined);
  assert.equal(result.plan, undefined);
  assert.equal(result.metrics[0].scope, 'team');
  assert.equal(result.metrics[0].period, 'calendar_month');
  assert.equal(result.metrics[0].limit, null);
  assert.equal(result.metrics[0].resetAt, undefined);
  assert.doesNotMatch(JSON.stringify(result), /unit-test-private-token|team_fixture|billing cycle/i);
});

test('explicit reporting dates use an exclusive UTC end and reject invalid or excessive windows', async () => {
  const result = await fetchVercelUsage({ start: '2026-09-16', end: '2026-10-16' }, { ...config, fetch: async input => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('from'), '2026-09-16T00:00:00.000Z');
    assert.equal(url.searchParams.get('to'), '2026-10-16T00:00:00.000Z');
    return new Response(jsonl([row()]));
  } });
  assert.equal(result.metrics[0].period, 'custom');
  assert.match(result.window?.label ?? '', /end date excluded/);
  for (const window of [
    { start: '2026-02-30', end: '2026-03-02' }, { start: '2026-1-01', end: '2026-02-01' },
    { start: '2026-03-02', end: '2026-03-02' }, { start: '2026-03-02', end: '2026-03-01' },
    { start: '2025-01-01', end: '2026-01-02' }, { start: 'no-date', end: '2026-03-02' },
  ]) {
    const invalid = await fetchVercelUsage(window, { ...config, fetch: async () => { assert.fail('Invalid dates must not reach the provider.'); } });
    assert.equal(invalid.status, 'unavailable');
    assert.deepEqual(invalid.metrics, []);
  }
});

test('consumption is grouped only by SKU and original unit across all projects and regions', async () => {
  const records = [
    row({ ConsumedQuantity: '2.5', Tags: { ProjectId: 'private-project-a' }, RegionId: 'region-a', BilledCost: 999 }),
    row({ ConsumedQuantity: 3.5, Tags: { ProjectId: 'private-project-b' }, RegionId: 'region-b', EffectiveCost: 1000 }),
    row({ ConsumedQuantity: 4, ConsumedUnit: 'MB' }),
    row({ ConsumedQuantity: '5e1', SkuId: 'origin-transfer' }),
    ...['Purchase', 'Tax', 'Adjustment', 'Credit'].map(ChargeCategory => row({ ChargeCategory, ConsumedQuantity: 1000 })),
  ];
  const result = await read(records);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.metrics.map(metric => metric.used).sort((a, b) => a! - b!), [4, 6, 50]);
  assert.equal(new Set(result.metrics.map(metric => metric.key)).size, 3);
  assert.ok(result.metrics.every(metric => /^sku:[a-f0-9]{64}$/.test(metric.key) && metric.limit === null && metric.scope === 'team'));
  assert.doesNotMatch(JSON.stringify(result), /private-project|region-a|BilledCost|EffectiveCost|999|1000/);
  const reversed = await read([...records].reverse());
  assert.deepEqual(result.metrics, reversed.metrics);
});

test('metric keys are stable, bounded, and unambiguous for delimiter-like and long dimensions', async () => {
  const result = await read([
    row({ SkuId: 'a:b', ConsumedUnit: 'c' }), row({ SkuId: 'a', ConsumedUnit: 'b:c' }),
    row({ SkuId: 'z'.repeat(2000), ConsumedUnit: 'requests' }),
  ]);
  assert.equal(result.metrics.length, 3);
  assert.equal(new Set(result.metrics.map(metric => metric.key)).size, 3);
  assert.ok(result.metrics.every(metric => metric.key.length <= 140));
});

test('streaming JSONL tolerates CRLF and split UTF-8, sanitizes labels, and retains a measured zero', async () => {
  const text = `${JSON.stringify(row({ SkuDescription: '\u0000 CDN \n คำขอ \u202e ' + 'x'.repeat(200), ConsumedQuantity: '0' }))}\r\n\r\n`;
  const data = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (let offset = 0; offset < data.length; offset += 2) controller.enqueue(data.slice(offset, offset + 2));
    controller.close();
  } });
  const result = await fetchVercelUsage(null, { ...config, fetch: fetchBody(stream) });
  assert.equal(result.status, 'ready');
  assert.equal(result.metrics[0].used, 0);
  assert.equal(result.metrics[0].label.length, 160);
  assert.match(result.metrics[0].label, /^CDN คำขอ /u);
  assert.doesNotMatch(result.metrics[0].label, /[\p{Cc}\p{Cf}]/u);
});

test('empty and explicitly unmeasurable data is partial, never an invented zero allowance', async () => {
  for (const rows of [[], [row({ ChargeCategory: 'Purchase' })], [row({ ConsumedQuantity: null, ConsumedUnit: null })]]) {
    const result = await read(rows);
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.metrics, []);
    assert.match(result.message ?? '', /does not establish zero usage/);
  }
  const mixed = await read([row(), row({ ConsumedQuantity: null, ConsumedUnit: null })]);
  assert.equal(mixed.status, 'partial');
  assert.equal(mixed.metrics[0].used, 1.25);
});

test('malformed or uncertain measurement rows cannot produce apparently complete totals', async () => {
  for (const bad of [
    null, [], {}, row({ ChargeCategory: 'usage' }), row({ ChargeCategory: 'Unknown' }),
    row({ ConsumedQuantity: '' }), row({ ConsumedQuantity: false }), row({ ConsumedQuantity: 'Infinity' }),
    row({ ConsumedQuantity: '-1' }), row({ ConsumedQuantity: '0x10' }), row({ ConsumedQuantity: '1e999' }),
    row({ ConsumedQuantity: Number.MAX_SAFE_INTEGER + 1 }), row({ SkuId: '' }), row({ ConsumedUnit: '' }),
    row({ ConsumedUnit: 'GB\nrequests' }), row({ ConsumedUnit: 'x'.repeat(81) }),
  ]) {
    const result = await read([row(), bad]);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.metrics, []);
  }
  const overflow = await read([row({ ConsumedQuantity: Number.MAX_SAFE_INTEGER }), row({ ConsumedQuantity: 1 })]);
  assert.equal(overflow.status, 'unavailable');
  assert.deepEqual(overflow.metrics, []);
});

test('provider HTTP errors, redirects, and private exception text remain unavailable and redacted', async () => {
  for (const status of [206, 301, 401, 403, 404, 429, 503]) {
    const result = await fetchVercelUsage(null, { ...config, fetch: fetchBody('token=secret private billing details', { status }) });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.metrics, []);
    assert.doesNotMatch(JSON.stringify(result), /token=secret|private billing details/);
  }
  const failed = await fetchVercelUsage(null, { ...config, fetch: async () => { throw new Error('Bearer secret account-private-info'); } });
  assert.equal(failed.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(failed), /Bearer|secret|account-private-info/);
});

test('truncated JSONL, invalid UTF-8, and stream failures discard earlier valid rows', async () => {
  for (const body of [jsonl([row()]) + '\n{"ChargeCategory":', new Uint8Array([0xff])]) {
    const result = await fetchVercelUsage(null, { ...config, fetch: fetchBody(body) });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.metrics, []);
  }
  let pulls = 0;
  const broken = new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(new TextEncoder().encode(jsonl([row()]) + '\n'));
    else controller.error(new Error('private provider failure'));
  } });
  const result = await fetchVercelUsage(null, { ...config, fetch: fetchBody(broken) });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.metrics, []);
});

test('2 MiB byte limits and 20,000 row limits prevent partial totals from escaping', async () => {
  for (const [body, init] of [
    ['{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }],
    [jsonl([row()]) + '\n' + ' '.repeat(2 * 1024 * 1024), undefined],
    [Array.from({ length: 20_001 }, () => '{"ChargeCategory":"Purchase"}').join('\n'), undefined],
  ] as [string, ResponseInit | undefined][]) {
    const result = await fetchVercelUsage(null, { ...config, fetch: fetchBody(body, init) });
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.metrics, []);
  }
  const exactRows = await fetchVercelUsage(null, { ...config, fetch: fetchBody(Array.from({ length: 20_000 }, () => '{"ChargeCategory":"Purchase"}').join('\n')) });
  assert.equal(exactRows.status, 'partial');
});

test('timeouts bound both a stalled fetch and a stalled response body', async () => {
  const stalledFetch = await fetchVercelUsage(null, { ...config, timeoutMs: 5, fetch: async () => new Promise<Response>(() => {}) });
  assert.equal(stalledFetch.status, 'unavailable');
  let cancelled = false;
  const stalledBody = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(jsonl([row()]) + '\n')); },
    cancel() { cancelled = true; },
  });
  const result = await fetchVercelUsage(null, { ...config, timeoutMs: 5, fetch: fetchBody(stalledBody) });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.metrics, []);
  assert.equal(cancelled, true);
});

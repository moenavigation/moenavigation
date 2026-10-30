import 'server-only';
import { createHash } from 'node:crypto';
import type { UsageMetric, UsageProvider } from '@/lib/cms-usage';

type ReportingWindow = { start: string; end: string };
type Dependencies = {
  fetch?: typeof fetch;
  now?: () => Date;
  token?: string;
  teamId?: string;
  timeoutMs?: number;
};

const maximumBytes = 2 * 1024 * 1024;
const maximumRows = 20_000;
const chargeCategories = new Set(['Usage', 'Purchase', 'Tax', 'Adjustment', 'Credit']);
const providerNote = 'Recorded consumption for the whole Vercel team. Plan allowance and reset dates are not supplied by this API.';

function displayLabel(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 160) : '';
}

function reportingWindow(window: ReportingWindow | null | undefined, now: Date): NonNullable<UsageProvider['window']> {
  if (!window) return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    end: now.toISOString(),
    label: 'Calendar month to date (UTC)',
  };
  const date = (raw: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('Invalid reporting date.');
    const result = new Date(`${raw}T00:00:00.000Z`);
    if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== raw) throw new Error('Invalid reporting date.');
    return result;
  };
  const start = date(window.start);
  const end = date(window.end);
  const latestEnd = new Date(start);
  latestEnd.setUTCFullYear(latestEnd.getUTCFullYear() + 1);
  if (end <= start || end > latestEnd) throw new Error('Invalid reporting range.');
  return { start: start.toISOString(), end: end.toISOString(), label: 'Selected reporting dates (UTC; end date excluded)' };
}

function quantity(value: unknown): number {
  // FOCUS decimal values may be serialized as JSON numbers or decimal strings.
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) throw new Error('Invalid usage quantity.');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) throw new Error('Invalid usage quantity.');
  return parsed;
}

async function readCharges(response: Response, signal: AbortSignal, period: UsageMetric['period']) {
  if (!response.body || Number(response.headers.get('content-length')) > maximumBytes) throw new Error('Incomplete usage response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const metrics = new Map<string, UsageMetric>();
  let pending = '';
  let bytes = 0;
  let rows = 0;
  let missingMeasurements = false;
  let completed = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });

  const addRow = (line: string) => {
    if (!line.trim()) return;
    if (++rows > maximumRows) throw new Error('Usage response is too large.');
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid usage row.');
    const fields = row as Record<string, unknown>;
    if (typeof fields.ChargeCategory !== 'string' || !chargeCategories.has(fields.ChargeCategory)) throw new Error('Unknown charge category.');
    if (fields.ChargeCategory !== 'Usage') return;
    // Null explicitly means that this charge has no measurable resource quantity.
    if (fields.ConsumedQuantity === null || fields.ConsumedUnit === null) { missingMeasurements = true; return; }
    const used = quantity(fields.ConsumedQuantity);
    const sku = fields.SkuId;
    const unit = fields.ConsumedUnit;
    if (typeof sku !== 'string' || !sku.trim() || typeof unit !== 'string' || !unit.trim() || unit.length > 80 || /[\p{Cc}\p{Cf}]/u.test(unit)) throw new Error('Invalid usage dimensions.');
    // Hash the tuple so distinct SKUs/units never collide through concatenation or truncation.
    const key = `sku:${createHash('sha256').update(JSON.stringify([sku, unit])).digest('hex')}`;
    const current = metrics.get(key);
    const total = (current?.used ?? 0) + used;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw new Error('Usage total is too large.');
    if (current) current.used = total;
    else metrics.set(key, {
      key, label: displayLabel(fields.SkuDescription) || displayLabel(fields.ServiceName) || 'Vercel resource',
      used, limit: null, unit, scope: 'team', period, note: providerNote,
    });
  };

  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw new Error('Usage response is too large.');
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        addRow(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    addRow(pending);
    completed = true;
    return { metrics: [...metrics.values()].sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key)), missingMeasurements };
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!completed) cancel();
    reader.releaseLock();
  }
}

/** Public FOCUS endpoint only; no CLI process, private billing API, or inferred plan quota. */
export async function fetchVercelUsage(window?: ReportingWindow | null, dependencies: Dependencies = {}): Promise<UsageProvider> {
  const now = dependencies.now?.() ?? new Date();
  const base = { id: 'vercel' as const, name: 'Vercel', checkedAt: now.toISOString(), dashboardUrl: 'https://vercel.com/dashboard' };
  const token = (dependencies.token ?? process.env.VERCEL_USAGE_TOKEN ?? '').trim();
  const teamId = (dependencies.teamId ?? process.env.VERCEL_USAGE_TEAM_ID ?? '').trim();
  if (!token || !teamId) return { ...base, status: 'not_configured', metrics: [], message: 'Vercel usage is not connected. Add a dashboard reading or configure the server connection.' };

  let requestedWindow: NonNullable<UsageProvider['window']>;
  try { requestedWindow = reportingWindow(window, now); }
  catch { return { ...base, status: 'unavailable', metrics: [], message: 'The reporting dates are invalid. Choose a valid range of up to one year.' }; }

  const controller = new AbortController();
  const configuredTimeout = dependencies.timeoutMs ?? 10_000;
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(10_000, Math.max(1, configuredTimeout)) : 10_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new Error('Usage request timed out.')); }, timeoutMs);
    });
    const read = async () => {
      const url = new URL('https://api.vercel.com/v1/billing/charges');
      url.searchParams.set('teamId', teamId);
      url.searchParams.set('from', requestedWindow.start);
      url.searchParams.set('to', requestedWindow.end);
      const response = await (dependencies.fetch ?? fetch)(url, {
        method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/x-ndjson' },
        signal: controller.signal, redirect: 'error', cache: 'no-store',
      });
      if (response.status !== 200) { void response.body?.cancel().catch(() => {}); throw new Error('Vercel usage is unavailable.'); }
      return readCharges(response, controller.signal, window ? 'custom' : 'calendar_month');
    };
    const result = await Promise.race([read(), timedOut]);
    return {
      ...base, window: requestedWindow, status: !result.metrics.length || result.missingMeasurements ? 'partial' : 'ready', metrics: result.metrics,
      message: !result.metrics.length ? 'No recorded measurable consumption was returned for these dates. This does not establish zero usage or remaining allowance.' : result.missingMeasurements ? 'Some charges do not provide a measurable resource quantity. Only recorded measurements are shown.' : providerNote,
    };
  } catch {
    // Provider bodies and error messages may contain credentials, billing details, or private metadata.
    return { ...base, window: requestedWindow, status: 'unavailable', metrics: [], message: 'Vercel usage could not be read completely. Check the provider dashboard or try again later.' };
  } finally { if (timeout) clearTimeout(timeout); controller.abort(); }
}

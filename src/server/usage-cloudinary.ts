import 'server-only';
import type { UsageMetric, UsageProvider } from '@/lib/cms-usage';

// Sources: https://cloudinary.com/documentation/admin_api#usage
// https://cloudinary.com/documentation/billing_and_plans
const dashboardUrl = 'https://console.cloudinary.com/';
const maximumResponseBytes = 256 * 1024;
const knownPlans = ['Free', 'Plus', 'Advanced', 'Advanced Extra', 'Pro PAYG', 'Enterprise', 'Basic', 'Pro', 'Premium', 'Business'] as const;
const creditPlans = new Set(['Free', 'Plus', 'Advanced', 'Advanced Extra', 'Pro PAYG']);
const rollingPlans = new Set(['Free', 'Plus', 'Advanced', 'Advanced Extra']);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const count = (value: unknown) => number(value) !== null && Number.isInteger(value) ? value as number : null;
const base = (checkedAt: Date): Pick<UsageProvider, 'id' | 'name' | 'checkedAt' | 'dashboardUrl'> => ({ id: 'cloudinary', name: 'Cloudinary', checkedAt: checkedAt.toISOString(), dashboardUrl });

function reportDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return;
  const parsed = new Date(value);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) return;
  return parsed.toISOString();
}
type RateLimit = { allowed: number | null; remaining: number | null; resetAt?: string };

/** Copy only documented aggregate fields; account names, credentials, add-ons, and errors never leave this adapter. */
export function normalizeCloudinaryUsage(payload: unknown, checkedAt = new Date(), rateLimit?: RateLimit): UsageProvider {
  const data = object(payload);
  const reportedPlan = typeof data.plan === 'string' ? data.plan.toLowerCase().trim() : '';
  const plan = knownPlans.find(value => value.toLowerCase() === reportedPlan);
  const credits = object(data.credits);
  const storage = object(data.storage), bandwidth = object(data.bandwidth), transformations = object(data.transformations);
  const sharedCredits = Boolean(plan && creditPlans.has(plan)) || Object.keys(credits).length > 0
    || [storage, bandwidth, transformations].some(metric => number(metric.credits_usage) !== null);
  const activityPeriod: UsageMetric['period'] = plan && rollingPlans.has(plan) ? 'rolling_30_days' : 'unknown';
  const periodNote = plan && rollingPlans.has(plan)
    ? 'This plan uses a rolling 30-day activity window. The API does not provide exact window boundaries.'
    : 'Cloudinary reports the usage period for this plan; exact window boundaries are unavailable.';
  const scopeNote = 'Includes the entire connected Cloudinary product environment, across all folders and applications.';
  const metric = (key: string, label: string, used: number | null, limit: number | null, unit: string, period: UsageMetric['period'], note?: string): UsageMetric => ({ key, label, used, limit, unit, scope: 'environment', period, ...(note ? { note } : {}) });
  const metrics: UsageMetric[] = [];
  if (sharedCredits) metrics.push(metric('credits', 'Shared credits', number(credits.usage), number(credits.limit), 'credits', activityPeriod, `Storage, delivery, and transformations share this allowance. Usage covers this product environment; other environments may share the plan allowance. ${periodNote}`));
  metrics.push(
    metric('storage', 'Storage', count(storage.usage), sharedCredits ? null : count(storage.limit), 'bytes', 'current', sharedCredits ? 'Current stored size; it contributes to shared credits and has no independent allowance shown here.' : 'Current stored size, including originals, derived assets, and Cloudinary backups.'),
    metric('bandwidth', 'Delivery bandwidth', count(bandwidth.usage), sharedCredits ? null : count(bandwidth.limit), 'bytes', activityPeriod, `${periodNote}${sharedCredits ? ' Contributes to the shared credit allowance.' : ''}`),
    metric('transformations', 'Transformations', count(transformations.usage), sharedCredits ? null : count(transformations.limit), 'count', activityPeriod, `${periodNote}${sharedCredits ? ' Contributes to the shared credit allowance.' : ''}`),
  );
  if (count(data.resources) !== null) metrics.push(metric('resources', 'Original assets', count(data.resources), null, 'count', 'current'));
  for (const [key, label, values] of [
    ['storage_credits', 'Storage credits', storage], ['bandwidth_credits', 'Delivery credits', bandwidth], ['transformation_credits', 'Transformation credits', transformations],
  ] as const) {
    if (number(values.credits_usage) !== null) metrics.push(metric(key, label, number(values.credits_usage), null, 'credits', key === 'storage_credits' ? 'current' : activityPeriod, 'Part of the shared credit usage, not an additional or independent allowance.'));
  }
  if (rateLimit && (rateLimit.allowed !== null || rateLimit.remaining !== null)) {
    const used = rateLimit.allowed !== null && rateLimit.remaining !== null && rateLimit.remaining <= rateLimit.allowed ? rateLimit.allowed - rateLimit.remaining : null;
    metrics.push({ ...metric('admin_requests', 'Admin API requests', used, rateLimit.allowed, 'count', 'hourly', 'Only Admin API calls; this is separate from image delivery, uploads, and shared credits.'), ...(rateLimit.resetAt ? { resetAt: rateLimit.resetAt } : {}) });
  }
  const hasUsage = metrics.some(item => item.key !== 'admin_requests' && item.used !== null);
  if (!hasUsage) return { ...base(checkedAt), status: 'unavailable', metrics: [], message: 'Cloudinary returned no usable usage figures. Try again later.' };
  const capacity = sharedCredits ? metrics.filter(item => item.key === 'credits') : metrics.filter(item => ['storage', 'bandwidth', 'transformations'].includes(item.key));
  const complete = capacity.length > 0 && capacity.every(item => item.used !== null && item.limit !== null);
  const reportedAt = reportDate(data.last_updated);
  return {
    ...base(checkedAt), status: complete ? 'ready' : 'partial', metrics,
    ...(plan ? { plan: 'Current plan' } : {}), ...(reportedAt ? { reportedAt } : {}),
    message: `${scopeNote} Figures update periodically.${complete ? '' : ' Some allowances are not reported; remaining amounts are unknown for those metrics.'}`,
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > maximumResponseBytes) { await response.body?.cancel(); throw new Error('Usage response too large'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty usage response');
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumResponseBytes) { await reader.cancel(); throw new Error('Usage response too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
const headerCount = (value: string | null) => value !== null && /^\d+$/.test(value) ? count(Number(value)) : null;
function rateHeaders(headers: Headers): RateLimit {
  const reset = headers.get('x-featureratelimit-reset');
  const resetTime = reset && reset.length <= 80 ? Date.parse(reset) : NaN;
  return {
    allowed: headerCount(headers.get('x-featureratelimit-limit')),
    remaining: headerCount(headers.get('x-featureratelimit-remaining')),
    ...(Number.isFinite(resetTime) ? { resetAt: new Date(resetTime).toISOString() } : {}),
  };
}
type Dependencies = { fetcher?: typeof fetch; env?: Record<string, string | undefined>; now?: () => Date };

/** One bounded, read-only request; callers own refresh caching and authorization. */
export async function getCloudinaryUsage({ fetcher = fetch, env = process.env, now = () => new Date() }: Dependencies = {}): Promise<UsageProvider> {
  const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return { ...base(now()), status: 'not_configured', metrics: [], message: 'Cloudinary usage requires the existing server API credentials.' };
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(cloud) || key.length > 512 || secret.length > 2048 || /[\r\n]/.test(key + secret)) {
    return { ...base(now()), status: 'unavailable', metrics: [], message: 'Cloudinary usage configuration is invalid. Check the server configuration.' };
  }
  try {
    const response = await fetcher(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/usage`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message = [401, 403].includes(response.status) ? 'Cloudinary denied usage access. Check the server API credentials.'
        : [420, 429].includes(response.status) ? 'Cloudinary has limited usage requests. Try again later.'
        : 'Cloudinary usage is temporarily unavailable. Try again later.';
      return { ...base(now()), status: 'unavailable', metrics: [], message };
    }
    const payload = await boundedJson(response);
    return normalizeCloudinaryUsage(payload, now(), rateHeaders(response.headers));
  } catch {
    // Provider failures can contain authentication details. Never expose or log their raw message.
    return { ...base(now()), status: 'unavailable', metrics: [], message: 'Cloudinary usage could not be checked. Try again later.' };
  }
}

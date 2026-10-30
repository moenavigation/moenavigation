export const usageProviderIds = ['vercel', 'mongodb', 'cloudinary'] as const;
export type UsageProviderId = typeof usageProviderIds[number];
export type UsageMetric = {
  key: string; label: string; used: number | null; limit: number | null; unit: string;
  scope: 'team' | 'cluster' | 'database' | 'environment';
  period: 'current' | 'rolling_30_days' | 'calendar_month' | 'custom' | 'hourly' | 'unknown';
  note?: string; resetAt?: string; allowanceSource?: 'configured';
};
export type UsageProvider = {
  id: UsageProviderId; name: string; status: 'ready' | 'partial' | 'not_configured' | 'unavailable';
  metrics: UsageMetric[]; checkedAt: string; reportedAt?: string; plan?: string;
  window?: { start: string; end: string; label: string };
  dashboardUrl: string; message?: string;
};
export type UsageAllowance = { provider: UsageProviderId; metric: string; limit: number; unit: string };
export type VercelReading = { transferBytes: number | null; requests: number | null; periodLabel: string; recordedAt: string };
export type UsageSettings = { revision: number; allowances: UsageAllowance[]; vercelWindow: { start: string; end: string } | null; vercelReading: VercelReading | null };
export type UsageOverview = { providers: UsageProvider[]; settings: UsageSettings; nextRefreshAt: string; refreshed: boolean };

export function usageBalance(used: number | null, limit: number | null) {
  if (used === null || limit === null || !Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit < 0) return { remaining: null, exceeded: null, percent: null };
  const percent = limit === 0 ? used > 0 ? 100 : 0 : used / limit * 100;
  return { remaining: Math.max(0, limit - used), exceeded: Math.max(0, used - limit), percent: Number.isFinite(percent) ? percent : null };
}

'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Activity, Cloud, Database, ExternalLink, Gauge, Info, Pencil, RefreshCw, Settings2, X } from 'lucide-react';
import { CmsRequestError, cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import { usageBalance, type UsageMetric, type UsageOverview, type UsageProvider, type UsageSettings } from '@/lib/cms-usage';
import { containDialogFocus } from '@/lib/dialog-focus';
import styles from './CmsUsageDashboard.module.css';

const scopeLabels = { team: 'Whole team', cluster: 'Whole cluster', database: 'This database only', environment: 'Whole product environment' };
const periodLabels = { current: 'Current storage', rolling_30_days: 'Rolling 30 days', calendar_month: 'Calendar month', custom: 'Selected period', hourly: 'Hourly allowance', unknown: 'Provider reporting period' };
const statusLabels = { ready: 'Available', partial: 'Partial reading', not_configured: 'Needs setup', unavailable: 'Unavailable' };
const limitFields = [
  { provider: 'mongodb', metric: 'cluster_storage', label: 'MongoDB cluster storage (MiB)', unit: 'bytes', factor: 1024 * 1024 },
  { provider: 'vercel', metric: 'fast_data_transfer', label: 'Vercel Fast Data Transfer (GB)', unit: 'bytes', factor: 1e9 },
  { provider: 'vercel', metric: 'cdn_requests', label: 'Vercel CDN Requests', unit: 'count', factor: 1 },
] as const;
type DialogKind = 'reading' | 'limits';
type SettingsInput = Omit<UsageSettings, 'revision' | 'vercelReading'> & { expectedRevision: number; readingUpdated?: boolean; vercelReading: Omit<NonNullable<UsageSettings['vercelReading']>, 'recordedAt'> | null };

function formatAmount(value: number | null, unit: string, locale: string): string {
  if (value === null || !Number.isFinite(value)) return '';
  const language = locale === 'th' ? 'th-TH' : 'en-GB';
  if (unit === 'bytes') {
    const scales = [{ size: 1e12, label: 'TB' }, { size: 1e9, label: 'GB' }, { size: 1e6, label: 'MB' }, { size: 1e3, label: 'KB' }];
    const scale = scales.find(item => value >= item.size);
    return scale ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value / scale.size)} ${scale.label}` : `${new Intl.NumberFormat(language).format(value)} B`;
  }
  if (value > 0 && value < .001 && unit !== 'count') return `<${new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(.001)}`;
  return new Intl.NumberFormat(language, { maximumFractionDigits: unit === 'count' ? 0 : 3 }).format(value);
}
function dateLabel(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function MetricReading({ metric, primary = false, noteIsUserText = false }: { metric: UsageMetric; primary?: boolean; noteIsUserText?: boolean }) {
  const { t, locale } = useCmsLocale();
  const balance = usageBalance(metric.used, metric.limit);
  const amount = (value: number | null) => value === null ? t('Unknown') : `${formatAmount(value, metric.unit, locale)}${metric.unit === 'credits' ? ` ${t('credits')}` : !['bytes', 'count'].includes(metric.unit) ? ` ${t(metric.unit)}` : ''}`;
  const label = metric.period === 'current' && metric.unit !== 'bytes' && !metric.key.includes('storage') ? 'Current total' : periodLabels[metric.period];
  return <section className={`${styles.metric} ${primary ? styles.primaryMetric : ''}`} data-usage-metric={metric.key}>
    <div className={styles.metricHeading}><h3>{t(metric.label)}</h3><span>{t(scopeLabels[metric.scope])}</span></div>
    {(primary || metric.limit !== null) ? <>
      <div className={styles.remaining}><span>{t('Remaining')}</span><strong>{amount(balance.remaining)}</strong></div>
      <dl className={styles.figures}><div><dt>{t('Used')}</dt><dd>{amount(metric.used)}</dd></div><div><dt>{t('Allowance')}</dt><dd>{amount(metric.limit)}</dd></div></dl>
      {balance.percent !== null ? <div className={styles.progress} data-level={balance.percent >= 100 ? 'full' : balance.percent >= 80 ? 'high' : 'normal'} role="progressbar" aria-label={t('{metric} usage', { metric: t(metric.label) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(balance.percent))} aria-valuetext={t('{used} used of {limit}', { used: amount(metric.used), limit: amount(metric.limit) })}><span style={{ width: `${Math.min(100, Math.max(0, balance.percent))}%` }} /></div> : <p className={styles.unknown}>{t('Remaining usage cannot be calculated yet.')}</p>}
      {balance.exceeded !== null && balance.exceeded > 0 && <p className={styles.exceeded}>{t('Over allowance by {amount}', { amount: amount(balance.exceeded) })}</p>}
    </> : <div className={styles.simpleValue}><strong>{amount(metric.used)}</strong><span>{t('Used')}</span></div>}
    <p className={styles.period}>{t(label)}{metric.resetAt ? ` · ${t('Resets {date}', { date: dateLabel(metric.resetAt, locale) })}` : ''}</p>
    {metric.note && <p className={styles.metricNote}>{noteIsUserText ? metric.note : t(metric.note)}</p>}
    {'allowanceSource' in metric && metric.allowanceSource === 'configured' && <p className={styles.metricNote}>{t('Included allowance configured for this monitor.')}</p>}
  </section>;
}

function ProviderPanel({ provider, onReading, disabled }: { provider: UsageProvider; onReading: () => void; disabled: boolean }) {
  const { t, locale } = useCmsLocale();
  const Icon = provider.id === 'mongodb' ? Database : provider.id === 'cloudinary' ? Cloud : Activity;
  const primaryKey = provider.id === 'cloudinary' ? 'credits' : provider.id === 'mongodb' ? 'cluster_storage' : 'fast_data_transfer';
  const primary = provider.metrics.find(metric => metric.key === primaryKey) ?? provider.metrics[0];
  const remaining = provider.metrics.filter(metric => metric !== primary);
  const details = provider.id === 'cloudinary' ? remaining.filter(metric => !['storage', 'bandwidth', 'transformations'].includes(metric.key)) : [];
  const visible = remaining.filter(metric => !details.includes(metric));
  const manualVercel = provider.id === 'vercel' && provider.metrics.some(metric => metric.key === 'fast_data_transfer');
  const hasManualReading = manualVercel && provider.metrics.some(metric => metric.used !== null);
  return <article className={styles.provider} data-usage-provider={provider.id} aria-labelledby={`usage-${provider.id}-title`}>
    <header className={styles.providerHeading}><span className={styles.providerIcon}><Icon size={23} aria-hidden="true" /></span><div><h2 id={`usage-${provider.id}-title`}>{provider.name}</h2>{provider.plan && <p>{t('Current plan')}</p>}</div><span className={styles.status} data-status={provider.status}>{t(manualVercel && provider.status === 'not_configured' ? 'Needs reading' : statusLabels[provider.status])}</span></header>
    <div className={styles.providerBody}>
      {provider.id === 'vercel' && <button type="button" className={`button secondary ${styles.readingButton}`} disabled={disabled} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onReading(); }}><Pencil size={17} aria-hidden="true" />{t('Update Vercel reading')}</button>}
      {primary ? <MetricReading metric={primary} primary noteIsUserText={hasManualReading} /> : <div className={styles.noReading}><Gauge size={28} aria-hidden="true" /><p>{t('No usage reading is available yet.')}</p></div>}
      {visible.map(metric => <MetricReading key={metric.key} metric={metric} noteIsUserText={hasManualReading} />)}
      {provider.message && <p className={styles.providerMessage}>{t(provider.message)}</p>}
      {details.length > 0 && <details className={styles.details}><summary>{t('More usage details')}</summary><div>{details.map(metric => <MetricReading key={metric.key} metric={metric} />)}</div></details>}
    </div>
    <footer className={styles.providerFooter}><div>{manualVercel && !hasManualReading ? <p>{t('No reading recorded yet.')}</p> : <p>{t(manualVercel ? 'Reading recorded' : 'Last checked')}: {dateLabel(provider.checkedAt, locale) || t('Unknown')}</p>}{provider.reportedAt && <p>{t('Provider updated')}: {dateLabel(provider.reportedAt, locale)}</p>}{provider.window && <p>{t(provider.window.label)}: {provider.window.start} – {provider.window.end}</p>}</div><a href={provider.dashboardUrl} target="_blank" rel="noopener noreferrer">{t('Open {provider}', { provider: provider.name })}<ExternalLink size={16} aria-hidden="true" /></a></footer>
  </article>;
}

export default function CmsUsageDashboard() {
  const { t } = useCmsLocale();
  const [data, setData] = useState<UsageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const cooldownRef = useRef(0);
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const accept = useCallback((result: UsageOverview) => {
    if (!alive.current) return;
    setData(result);
    const next = Date.parse(result.nextRefreshAt);
    cooldownRef.current = Math.max(cooldownRef.current, Number.isFinite(next) ? next : 0);
    setCooldownUntil(cooldownRef.current); setNow(Date.now());
  }, []);
  const load = useCallback(async (manual = false) => {
    if (request.current || manual && Date.now() < cooldownRef.current) return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(''); setNotice('');
    if (manual) { cooldownRef.current = Date.now() + 60_000; setCooldownUntil(cooldownRef.current); setNow(Date.now()); }
    try {
      const result = await cmsRequest<UsageOverview>('/api/cms/usage', { method: manual ? 'POST' : 'GET', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]) });
      if (controller.signal.aborted || !alive.current) return;
      accept(result); if (manual) setNotice(result.refreshed ? 'Usage check completed. Provider reporting times may differ.' : 'Using recent readings.');
    } catch (cause) { if (!controller.signal.aborted && alive.current) setError(cmsErrorText(cause)); }
    finally { if (request.current === controller) { request.current = null; if (alive.current) setLoading(false); } }
  }, [accept]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => void load(), 0);
    return () => { alive.current = false; clearTimeout(timer); request.current?.abort(); request.current = null; };
  }, [load]);
  useEffect(() => {
    if (cooldownUntil <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(1000, cooldownUntil - now));
    return () => clearTimeout(timer);
  }, [cooldownUntil, now]);

  return <section className={styles.dashboard} aria-label={t('Service usage')}>
    <div className={styles.toolbar}><div><span>{t('Checks are cached for 10 minutes. Dashboard readings stay as entered until you update them.')}</span></div><div className={styles.actions}><button type="button" className="button secondary" disabled={loading || !data} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDialog('limits'); }}><Settings2 size={18} aria-hidden="true" />{t('Monitoring limits')}</button><button type="button" className="button" disabled={loading || remaining > 0} onClick={() => void load(true)}><RefreshCw size={18} aria-hidden="true" className={loading ? styles.spinning : ''} />{t(loading ? 'Checking usage…' : 'Refresh usage')}</button></div></div>
    {remaining > 0 && <p className={styles.cooldown}>{t('Refresh available in {seconds}s', { seconds: remaining })}</p>}
    {error && <div className={styles.error} role="alert"><p>{t(error)}</p>{data && <p>{t('Your last successful readings are still shown below.')}</p>}{!data && <button type="button" className="button secondary" disabled={loading || remaining > 0} onClick={() => void load(true)}>{t('Try again')}</button>}</div>}
    {notice && <p className={styles.notice} role="status">{t(notice)}</p>}
    {!data && loading && <div className={styles.loading} role="status"><Gauge size={28} aria-hidden="true" /><p>{t('Loading service usage…')}</p></div>}
    {data && <div className={styles.providers}>{data.providers.map(provider => <ProviderPanel key={provider.id} provider={provider} disabled={loading} onReading={() => setDialog('reading')} />)}</div>}
    <p className={styles.footnote}><Info size={18} aria-hidden="true" /><span>{t('Unknown means the provider has not supplied a reading or allowance. It does not mean zero usage or unlimited capacity.')} {t('Storage and transfer sizes use decimal KB, MB and GB. Monitoring storage limits use MiB where labelled.')}</span></p>
    {dialog && data && <UsageSettingsDialog kind={dialog} initialSettings={data.settings} onOverview={accept} onClose={() => setDialog(null)} onSaved={result => { accept(result); setDialog(null); setNotice(dialog === 'reading' ? 'Vercel reading saved.' : 'Monitoring limits saved.'); }} />}
  </section>;
}

function settingsInput(settings: UsageSettings): SettingsInput {
  const reading = settings.vercelReading;
  return { expectedRevision: settings.revision, allowances: settings.allowances, vercelWindow: settings.vercelWindow, vercelReading: reading ? { transferBytes: reading.transferBytes, requests: reading.requests, periodLabel: reading.periodLabel } : null };
}
function sameSettings(settings: UsageSettings, desired: SettingsInput, baseline: UsageSettings) {
  if (desired.readingUpdated && !(Date.parse(settings.vercelReading?.recordedAt || '') > (baseline.vercelReading ? Date.parse(baseline.vercelReading.recordedAt) : -Infinity))) return false;
  const normalized = (value: SettingsInput) => JSON.stringify({ allowances: [...value.allowances].sort((a, b) => `${a.provider}:${a.metric}`.localeCompare(`${b.provider}:${b.metric}`)), vercelWindow: value.vercelWindow, vercelReading: value.vercelReading });
  return settings.revision > desired.expectedRevision && normalized(settingsInput(settings)) === normalized(desired);
}
function UsageSettingsDialog({ kind, initialSettings, onClose, onSaved, onOverview }: { kind: DialogKind; initialSettings: UsageSettings; onClose: () => void; onSaved: (value: UsageOverview) => void; onOverview: (value: UsageOverview) => void }) {
  const { t, locale } = useCmsLocale();
  const modal = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const savingRef = useRef(false);
  const [base, setBase] = useState(initialSettings);
  const [transfer, setTransfer] = useState(initialSettings.vercelReading?.transferBytes == null ? '' : String(initialSettings.vercelReading.transferBytes / 1e9));
  const [requests, setRequests] = useState(initialSettings.vercelReading?.requests == null ? '' : String(initialSettings.vercelReading.requests));
  const [period, setPeriod] = useState(initialSettings.vercelReading?.periodLabel || t('Provider dashboard reporting window'));
  const [limits, setLimits] = useState(() => limitFields.map(field => { const value = initialSettings.allowances.find(item => item.provider === field.provider && item.metric === field.metric); return value ? String(value.limit / field.factor) : ''; }));
  const [saving, setSaving] = useState(false);
  const [clearReading, setClearReading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<UsageSettings | 'unloaded' | null>(null);
  const titleId = useId();
  const title = kind === 'reading' ? 'Update Vercel reading' : 'Monitoring limits';
  useEffect(() => {
    alive.current = true;
    const dialog = modal.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = 'hidden';
    return () => { alive.current = false; dialog?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  function numeric(value: string, factor = 1, integer = false) {
    if (!value.trim()) return null;
    const parsed = Number(value) * factor;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > (integer ? Number.MAX_SAFE_INTEGER : 1e18) || integer && !Number.isInteger(parsed)) throw new Error('Enter a valid non-negative number. Requests must be whole numbers.');
    return parsed;
  }
  function desiredInput() {
    const desired = settingsInput(base);
    if (kind === 'reading') {
      if (clearReading) { desired.vercelReading = null; return desired; }
      desired.readingUpdated = true;
      const transferBytes = numeric(transfer, 1e9), count = numeric(requests, 1, true);
      if (transferBytes === null && count === null) throw new Error('Enter at least one usage reading.');
      if (!period.trim()) throw new Error('Enter the reporting window shown in the provider dashboard.');
      desired.vercelReading = { transferBytes, requests: count, periodLabel: period.trim() };
    } else {
      desired.allowances = desired.allowances.filter(item => !limitFields.some(field => field.provider === item.provider && field.metric === item.metric));
      limitFields.forEach((field, index) => { const limit = numeric(limits[index], field.factor, field.unit === 'count'); if (limit !== null) desired.allowances.push({ provider: field.provider, metric: field.metric, unit: field.unit, limit }); });
    }
    return desired;
  }
  async function reviewLatest() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { const latest = await cmsRequest<UsageOverview>('/api/cms/usage'); if (alive.current) { setConflict(latest.settings); onOverview(latest); setError(''); } }
    catch (cause) { if (alive.current) setError(cmsErrorText(cause)); }
    finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || conflict) return;
    let desired: SettingsInput;
    try { desired = desiredInput(); } catch (cause) { setError(cmsErrorText(cause)); return; }
    savingRef.current = true; setSaving(true); setError('');
    try { const result = await cmsRequest<UsageOverview>('/api/cms/usage', { method: 'PUT', body: JSON.stringify(desired) }); if (alive.current) onSaved(result); }
    catch (cause) {
      if (!(cause instanceof CmsRequestError) || cause.status === 0 || cause.status >= 500 || cause.status === 409) {
        try {
          const latest = await cmsRequest<UsageOverview>('/api/cms/usage');
          if (sameSettings(latest.settings, desired, base)) { if (alive.current) onSaved(latest); return; }
          if (alive.current && latest.settings.revision !== base.revision) { setConflict(latest.settings); onOverview(latest); }
        } catch { if (alive.current && cause instanceof CmsRequestError && cause.status === 409) setConflict('unloaded'); }
      }
      if (alive.current) setError(cmsErrorText(cause));
    } finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }
  return <dialog ref={modal} className={styles.dialog} aria-labelledby={titleId} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header className={styles.dialogHeading}><h2 id={titleId}>{t(title)}</h2><button type="button" className={styles.close} autoFocus aria-label={t('Close usage settings')} disabled={saving} onClick={onClose}><X size={21} aria-hidden="true" /></button></header>
    <form className={styles.form} onSubmit={save} aria-busy={saving}><div className={styles.dialogBody}>
      <p>{t(kind === 'reading' ? 'Copy the readings from your Vercel dashboard. Leave a number blank if it is unknown.' : 'These allowances are used only by this monitor. They do not change your provider plan or billing.')}</p>
      {kind === 'reading' && initialSettings.vercelReading && <label className={styles.clearReading}><input type="checkbox" checked={clearReading} disabled={saving} onChange={event => setClearReading(event.target.checked)} /><span>{t('Clear saved reading')}<small>{t('Automatic readings appear when the server connection is available.')}</small></span></label>}
      {kind === 'reading' ? <><a className={styles.externalLink} href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">{t('Open Vercel')}<ExternalLink size={16} aria-hidden="true" /></a><label className={styles.field}>{t('Fast Data Transfer (GB)')}<input name="transferGb" type="number" inputMode="decimal" min="0" max="1000000000" step="any" value={transfer} disabled={saving || clearReading} onChange={event => setTransfer(event.target.value)} /></label><label className={styles.field}>{t('CDN Requests')}<input name="requests" type="number" inputMode="numeric" min="0" max={Number.MAX_SAFE_INTEGER} step="1" value={requests} disabled={saving || clearReading} onChange={event => setRequests(event.target.value)} /></label><label className={styles.field}>{t('Reporting window')}<input name="periodLabel" type="text" required maxLength={120} value={period} disabled={saving || clearReading} onChange={event => setPeriod(event.target.value)} /><span>{t('Use the dates or period label shown beside the readings.')}</span></label></> : <>{limitFields.map((field, index) => <label key={field.metric} className={styles.field}>{t(field.label)}<input name={field.metric} type="number" inputMode={field.unit === 'count' ? 'numeric' : 'decimal'} min="0" step={field.unit === 'count' ? '1' : 'any'} value={limits[index]} disabled={saving} onChange={event => setLimits(previous => previous.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /></label>)}<p className={styles.inputHint}>{t('Leave an allowance blank when it is unknown. Zero means no allowance. Cloudinary uses the allowance reported by its API.')}</p></>}
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {conflict && <section className={styles.conflict} aria-label={t('Monitoring settings conflict')}><p>{t('Monitoring settings changed elsewhere. Your entries are kept. Review the saved settings before replacing these values.')}</p>{conflict === 'unloaded' ? <button type="button" className="button secondary" disabled={saving} onClick={() => void reviewLatest()}>{t('Review latest settings')}</button> : <><h3>{t('Currently saved')}</h3><dl>{kind === 'reading' ? <><div><dt>{t('Fast Data Transfer (GB)')}</dt><dd>{conflict.vercelReading?.transferBytes == null ? t('Unknown') : formatAmount(conflict.vercelReading.transferBytes / 1e9, 'decimal', locale)}</dd></div><div><dt>{t('CDN Requests')}</dt><dd>{conflict.vercelReading?.requests == null ? t('Unknown') : formatAmount(conflict.vercelReading.requests, 'count', locale)}</dd></div><div><dt>{t('Reporting window')}</dt><dd>{conflict.vercelReading?.periodLabel || t('Unknown')}</dd></div></> : limitFields.map(field => { const value = conflict.allowances.find(item => item.provider === field.provider && item.metric === field.metric); return <div key={field.metric}><dt>{t(field.label)}</dt><dd>{value ? formatAmount(value.limit / field.factor, field.unit === 'count' ? 'count' : 'decimal', locale) : t('Unknown')}</dd></div>; })}</dl><button type="button" className="button secondary" disabled={saving} onClick={() => { setBase(conflict); setConflict(null); setError(''); modal.current?.querySelector<HTMLInputElement>('input')?.focus(); }}>{t('Use my entered values')}</button></>}</section>}
    </div><footer className={styles.dialogFooter}><button type="button" className="button secondary" disabled={saving} onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button" disabled={saving || Boolean(conflict)}>{t(saving ? 'Saving…' : kind === 'reading' ? clearReading ? 'Clear saved reading' : 'Save reading' : 'Save limits')}</button></footer></form>
  </dialog>;
}

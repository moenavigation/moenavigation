'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Check, ExternalLink, Link2, MapPin } from 'lucide-react';
import Dialog from './Dialog';
import CmsWorkingPanel from './CmsWorkingPanel';
import { useCmsLocale } from '@/lib/cms-locale';
import { cmsContentPlaceholder } from '@/lib/cms-content-placeholders';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { googleMapsPointUrl, MAX_GOOGLE_MAPS_URL_LENGTH } from '@/lib/google-maps';
import styles from './CmsGoogleMapsDialog.module.css';

type Coordinates = { latitude: number; longitude: number };
type Result = { url: string; coordinates: Coordinates };

export default function CmsGoogleMapsDialog({ point, triggerRef, onClose, onApply }: {
  point: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onApply: (coordinates: Coordinates) => void;
}) {
  const { locale, t } = useCmsLocale();
  const id = useId();
  const [url, setUrl] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const coordinates = result?.url === url.trim() ? result.coordinates : null;

  useEffect(() => {
    const value = url.trim();
    if (!value) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const data = await cmsRequest<Coordinates>('/api/cms/routes/coordinates', {
          method: 'POST', body: JSON.stringify({ url: value }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (controller.signal.aborted) return;
        if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) {
          throw new Error('The coordinates could not be read. Try another Google Maps link.');
        }
        setResult({ url: value, coordinates: data });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cmsErrorText(cause));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [url, attempt]);

  function close() {
    requestRef.current?.abort();
    onClose();
  }

  return <Dialog open title={t('Google Maps link')} closeLabel={t('Close dialog')} onClose={close} triggerRef={triggerRef} className={styles.dialog}>
    <div className={styles.body}>
      <p className={styles.point}><MapPin size={18} aria-hidden="true" />{point}</p>
      <p id={`${id}-hint`} className={styles.hint}>{t('Paste a Google Maps pin link to find its coordinates.')}</p>
      <label className={styles.field} htmlFor={`${id}-url`}><span><Link2 size={18} aria-hidden="true" />{t('Google Maps link')}</span>
        <input id={`${id}-url`} type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={MAX_GOOGLE_MAPS_URL_LENGTH} placeholder={cmsContentPlaceholder('googleMapsLink', locale)} aria-describedby={`${id}-hint`} aria-invalid={Boolean(error)} value={url} onChange={event => {
          requestRef.current?.abort();
          setUrl(event.target.value); setResult(null); setError(''); setBusy(Boolean(event.target.value.trim()));
        }} onKeyDown={event => {
          // This dialog lives inside the route form. Enter must never save it.
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); }
        }} />
      </label>
      <CmsWorkingPanel active={busy} title="Finding coordinates…" />
      {error && <div className={styles.error} role="alert"><p>{t(error)}</p><button type="button" className={styles.retry} onClick={() => { setError(''); setBusy(true); setAttempt(value => value + 1); }}>{t('Try again')}</button></div>}
      {coordinates && <div className={styles.preview}>
        <p className={styles.found} role="status"><Check size={18} aria-hidden="true" />{t('Coordinates found')}</p>
        <dl className={styles.coordinates}><div><dt>{t('Latitude')}</dt><dd>{coordinates.latitude}</dd></div><div><dt>{t('Longitude')}</dt><dd>{coordinates.longitude}</dd></div></dl>
        <a className={styles.mapLink} href={googleMapsPointUrl(coordinates.latitude, coordinates.longitude)} target="_blank" rel="noopener noreferrer">{t('Open in Google Maps')}<ExternalLink size={16} aria-hidden="true" /></a>
      </div>}
      <p className={styles.hint}>{t('Apply to this point, then save the route.')}</p>
      <div className={styles.actions}><button type="button" className="button secondary" onClick={close}>{t('Cancel')}</button><button type="button" className="button" disabled={busy || !coordinates} onClick={() => { if (coordinates) onApply(coordinates); }}><Check size={18} aria-hidden="true" />{t('Use coordinates')}</button></div>
    </div>
  </Dialog>;
}

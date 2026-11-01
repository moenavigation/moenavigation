'use client';

import { useId, useRef, useState } from 'react';
import { ExternalLink, Link2, MapPin, Plus, Route, Trash2, WandSparkles } from 'lucide-react';
import type { ContentRecord, RoutePort } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import { addRouteCoordinate, MAX_ROUTE_POINTS, removeRouteCoordinate, routeCoordinateRows, updateRouteCoordinate } from '@/lib/cms-route-fields';
import { googleMapsPointUrl } from '@/lib/google-maps';
import { applyGeneratedSeaRoute, readSeaRouteEndpoints } from '@/lib/sea-route';
import CmsGoogleMapsDialog from './CmsGoogleMapsDialog';
import CmsSeaRouteDialog from './CmsSeaRouteDialog';
import styles from './CmsRouteFields.module.css';

const emptyPort = (): RoutePort => ({ name: '', nameTh: '', country: '', countryTh: '' });

export default function CmsRouteFields({ record, disabled, routeText, onChange, onRouteText }: {
  record: ContentRecord;
  disabled: boolean;
  routeText: string;
  onChange: (patch: Partial<ContentRecord>) => void;
  onRouteText: (text: string) => void;
}) {
  const { t } = useCmsLocale();
  const id = useId();
  const points = routeCoordinateRows(routeText);
  const [importPoint, setImportPoint] = useState<{ index: number; label: string } | null>(null);
  const importTriggerRef = useRef<HTMLButtonElement | null>(null);
  const generateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [generationSource, setGenerationSource] = useState<{ routeText: string; record: ContentRecord } | null>(null);
  const canGenerate = Boolean(readSeaRouteEndpoints(routeText));

  function portFields(key: 'origin' | 'destination') {
    const port = record[key] || emptyPort();
    const required = Boolean(record[key]) || points.length > 0;
    return <fieldset className={styles.port}>
      <legend><MapPin size={19} aria-hidden="true" />{t(key === 'origin' ? 'Origin port' : 'Destination port')}</legend>
      <div className={styles.portFields}>{(['nameTh', 'countryTh', 'name', 'country'] as const).map(field => <label key={field}>
        {t(field === 'nameTh' ? 'Port name · Thai' : field === 'countryTh' ? 'Country · Thai' : field === 'name' ? 'Port name · English' : 'Country · English')}
        <input lang={field.endsWith('Th') ? 'th' : 'en'} required={required} maxLength={field.startsWith('country') ? 100 : 150} value={port[field]} onChange={event => {
          const next = { ...port, [field]: event.target.value };
          onChange({ [key]: Object.values(next).every(value => value === '') ? undefined : next });
        }} />
      </label>)}</div>
    </fieldset>;
  }

  function coordinateValidity(field: 'latitude' | 'longitude', value: string) {
    const limit = field === 'latitude' ? 90 : 180;
    if (!value.trim() || (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit)) return '';
    return t(field === 'latitude' ? 'Enter a latitude from −90 to 90.' : 'Enter a longitude from −180 to 180.');
  }

  return <fieldset className={styles.fields} disabled={disabled}>
    <div className={styles.heading}><Route size={21} aria-hidden="true" /><h3>{t('Route ports')}</h3></div>
    <p className={styles.hint}>{t('Add both ports in Thai and English to identify this connection. Port details are optional for a route without a map.')}</p>
    <div className={styles.ports}>{portFields('origin')}{portFields('destination')}</div>
    <details className={styles.map} open={points.length > 0}>
      <summary><span>{t('Map setup')}</span><span className={styles.hint}>{points.length ? t('{count} map points', { count: points.length }) : t('Optional')}</span></summary>
      <div className={styles.mapBody}>
        <p className={styles.hint}>{t('Use known coordinates to show this route on the map. Enter both ports above and at least an origin and a destination point.')}</p>
        <div className={styles.generator}>
          <div><strong>{t('Build a sea route')}</strong><p id={`${id}-generate-hint`} className={styles.hint}>{t(canGenerate ? 'Preview intermediate points along a sea route, then apply them to this draft.' : 'Enter valid, different origin and destination coordinates first.')}</p></div>
          <button ref={generateTriggerRef} type="button" className="button secondary" aria-haspopup="dialog" aria-describedby={`${id}-generate-hint`} disabled={disabled || !canGenerate} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setGenerationSource({ routeText, record }); }}><WandSparkles size={19} aria-hidden="true" />{t('Generate sea route')}</button>
        </div>
        {points.length > 0 && <>
          <p id={`${id}-ranges`} className={styles.hint}>{t('Latitude: −90 to 90. Longitude: −180 to 180. Points are connected in the order shown.')}</p>
          <ol className={styles.points}>{points.map((point, index) => {
            const label = index === 0 ? t('Origin point') : index === points.length - 1 ? t('Destination point') : t('Intermediate point {number}', { number: index });
            const valid = point.latitude.trim() !== '' && point.longitude.trim() !== '' && !coordinateValidity('latitude', point.latitude) && !coordinateValidity('longitude', point.longitude);
            return <li key={index} className={styles.point}>
              <div className={styles.pointHeading}><span className={styles.pointNumber}>{index + 1}</span><strong>{label}</strong><button type="button" className={styles.remove} aria-label={t('Remove {point}', { point: label })} title={t('Remove point')} onClick={() => onRouteText(removeRouteCoordinate(routeText, index))}><Trash2 size={18} aria-hidden="true" /><span>{t('Remove')}</span></button></div>
              <div className={styles.coordinates}>{(['latitude', 'longitude'] as const).map(field => <label key={field}>{t(field === 'latitude' ? 'Latitude' : 'Longitude')}
                <input type="text" inputMode="decimal" lang="en" required ref={element => { element?.setCustomValidity(coordinateValidity(field, point[field])); }} aria-label={t('{point} · {coordinate}', { point: label, coordinate: t(field === 'latitude' ? 'Latitude' : 'Longitude') })} aria-describedby={`${id}-ranges`} value={point[field]} onChange={event => {
                  event.target.setCustomValidity(coordinateValidity(field, event.target.value));
                  onRouteText(updateRouteCoordinate(routeText, index, field, event.target.value));
                }} onBlur={event => event.target.setCustomValidity(coordinateValidity(field, event.target.value))} />
              </label>)}</div>
              <div className={styles.pointActions}>
                <button type="button" className={styles.linkButton} aria-label={t('Use Google Maps link · {point}', { point: label })} onClick={event => { importTriggerRef.current = event.currentTarget; setImportPoint({ index, label }); }}><Link2 size={17} aria-hidden="true" />{t('Use Google Maps link')}</button>
                {valid && (index === 0 || index === points.length - 1) && <a className={styles.mapLink} href={googleMapsPointUrl(Number(point.latitude), Number(point.longitude))} target="_blank" rel="noopener noreferrer" aria-label={t('Open in Google Maps · {point}', { point: label })}>{t('Open in Google Maps')}<ExternalLink size={16} aria-hidden="true" /></a>}
              </div>
            </li>;
          })}</ol>
        </>}
        <button type="button" className="button secondary" disabled={disabled || points.length >= MAX_ROUTE_POINTS} onClick={() => onRouteText(addRouteCoordinate(routeText))}><Plus size={18} aria-hidden="true" />{t(points.length === 0 ? 'Set up map points' : points.length === 1 ? 'Add destination point' : 'Add intermediate point')}</button>
        <p className={styles.hint}>{t('Up to 100 points. Add intermediate points only when the route needs them.')}</p>
      </div>
    </details>
    {importPoint && <CmsGoogleMapsDialog point={importPoint.label} triggerRef={importTriggerRef} onClose={() => setImportPoint(null)} onApply={({ latitude, longitude }) => {
      const next = updateRouteCoordinate(routeText, importPoint.index, 'latitude', String(latitude));
      onRouteText(updateRouteCoordinate(next, importPoint.index, 'longitude', String(longitude)));
      setImportPoint(null);
    }} />}
    {generationSource && <CmsSeaRouteDialog record={generationSource.record} sourceText={generationSource.routeText} currentText={routeText} triggerRef={generateTriggerRef} onClose={() => setGenerationSource(null)} onApply={result => {
      if (routeText !== generationSource.routeText) throw new Error('The route points changed while this preview was open. Close it and generate a new preview.');
      onRouteText(applyGeneratedSeaRoute(routeText, result));
      setGenerationSource(null);
    }} />}
  </fieldset>;
}

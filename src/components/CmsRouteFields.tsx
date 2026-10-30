'use client';

import { useId } from 'react';
import { MapPin, Plus, Route, Trash2 } from 'lucide-react';
import type { ContentRecord, RoutePort } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import { addRouteCoordinate, MAX_ROUTE_POINTS, removeRouteCoordinate, routeCoordinateRows, updateRouteCoordinate } from '@/lib/cms-route-fields';
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
        {points.length > 0 && <>
          <p id={`${id}-ranges`} className={styles.hint}>{t('Latitude: −90 to 90. Longitude: −180 to 180. Points are connected in the order shown.')}</p>
          <ol className={styles.points}>{points.map((point, index) => {
            const label = index === 0 ? t('Origin point') : index === points.length - 1 ? t('Destination point') : t('Intermediate point {number}', { number: index });
            return <li key={index} className={styles.point}>
              <div className={styles.pointHeading}><span className={styles.pointNumber}>{index + 1}</span><strong>{label}</strong><button type="button" className={styles.remove} aria-label={t('Remove {point}', { point: label })} title={t('Remove point')} onClick={() => onRouteText(removeRouteCoordinate(routeText, index))}><Trash2 size={18} aria-hidden="true" /><span>{t('Remove')}</span></button></div>
              <div className={styles.coordinates}>{(['latitude', 'longitude'] as const).map(field => <label key={field}>{t(field === 'latitude' ? 'Latitude' : 'Longitude')}
                <input type="text" inputMode="decimal" lang="en" required ref={element => { element?.setCustomValidity(coordinateValidity(field, point[field])); }} aria-label={t('{point} · {coordinate}', { point: label, coordinate: t(field === 'latitude' ? 'Latitude' : 'Longitude') })} aria-describedby={`${id}-ranges`} value={point[field]} onChange={event => {
                  event.target.setCustomValidity(coordinateValidity(field, event.target.value));
                  onRouteText(updateRouteCoordinate(routeText, index, field, event.target.value));
                }} onBlur={event => event.target.setCustomValidity(coordinateValidity(field, event.target.value))} />
              </label>)}</div>
            </li>;
          })}</ol>
        </>}
        <button type="button" className="button secondary" disabled={disabled || points.length >= MAX_ROUTE_POINTS} onClick={() => onRouteText(addRouteCoordinate(routeText))}><Plus size={18} aria-hidden="true" />{t(points.length === 0 ? 'Set up map points' : points.length === 1 ? 'Add destination point' : 'Add intermediate point')}</button>
        <p className={styles.hint}>{t('Up to 100 points. Add intermediate points only when the route needs them.')}</p>
      </div>
    </details>
  </fieldset>;
}

'use client';

import 'leaflet/dist/leaflet.css';

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Check, ExternalLink, MapPin, Minus, Plus, RotateCcw } from 'lucide-react';
import type * as Leaflet from 'leaflet';
import { useCmsLocale } from '@/lib/cms-locale';
import { cmsContentPlaceholder } from '@/lib/cms-content-placeholders';
import { routeCoordinateRows, updateRouteCoordinate } from '@/lib/cms-route-fields';
import { googleMapsPointUrl } from '@/lib/google-maps';
import { initialMapRouteText, isMapRouteReady, mapRoutePoints, moveMapRoutePoint } from '@/lib/cms-route-map';
import type { SeaRoutePoint } from '@/lib/sea-route';
import Dialog from './Dialog';
import styles from './CmsRouteMapDialog.module.css';

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const providerAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
const attribution = providerAttribution ? `${providerAttribution} · ${osmAttribution}` : osmAttribution;

function PointMap({ text, selected, disabled, onSelect, onMove, onReady }: {
  text: string;
  selected: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, latitude: number, longitude: number) => void;
  onReady: (ready: boolean) => void;
}) {
  const { t } = useCmsLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const latest = useRef({ text, selected, disabled, onSelect, onMove });
  const syncRef = useRef<() => void>(() => {});
  const fitRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    const selectionChanged = latest.current.selected !== selected;
    latest.current = { text, selected, disabled, onSelect, onMove };
    syncRef.current();
    const point = mapRoutePoints(text)[selected];
    if (selectionChanged && point) mapRef.current?.panInside(point, { padding: [45, 45], animate: false });
  }, [text, selected, disabled, onSelect, onMove]);

  useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    const markers = new Map<number, Leaflet.Marker>();
    let dragging: number | null = null;
    let suppressClickUntil = 0;

    async function initialize() {
      const leaflet = await import('leaflet');
      if (disposed || !containerRef.current) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const currentMap = leaflet.map(containerRef.current, {
        zoomControl: false, scrollWheelZoom: false, keyboard: true, doubleClickZoom: false,
        zoomAnimation: !reduced, fadeAnimation: !reduced, markerZoomAnimation: !reduced,
        minZoom: 2, maxZoom: 18, maxBounds: [[-85, -180], [85, 180]], maxBoundsViscosity: 1,
      });
      map = currentMap;
      mapRef.current = currentMap;
      currentMap.attributionControl.setPrefix(false);
      fitRef.current = () => {
        const valid = mapRoutePoints(latest.current.text).filter((point): point is SeaRoutePoint => point !== null);
        if (valid.length) currentMap.fitBounds(leaflet.latLngBounds(valid), { padding: [50, 50], maxZoom: 12, animate: false });
        else currentMap.setView([13, 101], 5, { animate: false });
      };
      // Leaflet creates marker elements only after its initial view is established.
      fitRef.current();
      const tiles = leaflet.tileLayer(tileUrl, { attribution, maxZoom: 19 });
      let loaded = 0, errors = 0;
      tiles.on('loading', () => { loaded = 0; errors = 0; });
      tiles.on('tileload', () => { loaded++; });
      tiles.on('tileerror', () => { errors++; });
      tiles.on('load', () => { if (!disposed) setTileError(errors > 0 && loaded === 0); });
      tiles.addTo(currentMap);
      const outline = leaflet.polyline([], { color: '#fff', weight: 8, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(currentMap);
      const line = leaflet.polyline([], { color: '#0b527f', weight: 3.5, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(currentMap);
      const label = (index: number, count: number) => index === 0 ? t('Origin point') : index === count - 1 ? t('Destination point') : t('Intermediate point {number}', { number: index });

      function sync() {
        const state = latest.current;
        const points = mapRoutePoints(state.text);
        const segments: SeaRoutePoint[][] = [];
        let segment: SeaRoutePoint[] = [];
        for (const point of points) {
          if (point) segment.push(point);
          else { if (segment.length > 1) segments.push(segment); segment = []; }
        }
        if (segment.length > 1) segments.push(segment);
        outline.setLatLngs(segments);
        line.setLatLngs(segments);
        for (const [index, marker] of markers) {
          if (!points[index]) { marker.remove(); markers.delete(index); }
        }
        points.forEach((point, index) => {
          if (!point) return;
          let marker = markers.get(index);
          if (!marker) {
            const number = document.createElement('span');
            number.textContent = String(index + 1);
            number.setAttribute('aria-hidden', 'true');
            marker = leaflet.marker(point, {
              icon: leaflet.divIcon({ className: styles.marker, html: number, iconSize: [44, 44], iconAnchor: [22, 22] }),
              draggable: !state.disabled, autoPan: true, autoPanPadding: [45, 45],
              keyboard: true, autoPanOnFocus: false, bubblingMouseEvents: false,
            }).addTo(currentMap);
            const currentMarker = marker;
            const select = () => { if (!latest.current.disabled) latest.current.onSelect(index); };
            marker.on('click', event => {
              leaflet.DomEvent.stopPropagation(event.originalEvent);
              if (Date.now() >= suppressClickUntil) select();
            });
            marker.on('dragstart', () => { dragging = index; select(); });
            marker.on('drag', () => {
              if (latest.current.disabled) return;
              const position = currentMarker.getLatLng();
              latest.current.onMove(index, position.lat, position.lng);
            });
            marker.on('dragend', () => {
              dragging = null;
              suppressClickUntil = Date.now() + 250;
              if (!latest.current.disabled) {
                const position = currentMarker.getLatLng();
                latest.current.onMove(index, position.lat, position.lng);
              }
            });
            const element = marker.getElement()!;
            element.dataset.routePointIndex = String(index);
            element.dataset.pointKind = index === 0 ? 'origin' : index === points.length - 1 ? 'destination' : 'intermediate';
            element.setAttribute('aria-label', t('Select {point}', { point: label(index, points.length) }));
            element.addEventListener('keydown', event => {
              if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); select(); }
            });
            element.addEventListener('focus', () => {
              if (element.matches(':focus-visible')) currentMap.panInside(currentMarker.getLatLng(), { padding: [40, 40], animate: false });
            });
            markers.set(index, marker);
          } else if (dragging !== index) marker.setLatLng(point);
          const element = marker.getElement();
          if (element) {
            element.dataset.selected = String(index === state.selected);
            element.setAttribute('aria-pressed', String(index === state.selected));
            element.setAttribute('aria-disabled', String(state.disabled));
          }
          marker.setZIndexOffset(index === state.selected ? 2000 : index === 0 || index === points.length - 1 ? 1000 : 0);
          if (state.disabled) marker.dragging?.disable(); else marker.dragging?.enable();
        });
      }
      syncRef.current = sync;
      sync();
      currentMap.on('click', event => {
        if (latest.current.disabled || dragging !== null || Date.now() < suppressClickUntil) return;
        latest.current.onMove(latest.current.selected, event.latlng.lat, event.latlng.lng);
      });
      currentMap.on('dragend', () => { suppressClickUntil = Date.now() + 250; });
      currentMap.on('zoomend', () => { if (!disposed) setZoom(currentMap.getZoom()); });
      observer = new ResizeObserver(() => { currentMap.invalidateSize({ pan: false }); });
      observer.observe(containerRef.current);
      setZoom(currentMap.getZoom());
      setReady(true);
      onReady(true);
    }
    void initialize().catch(() => { if (!disposed) { setFailed(true); onReady(false); } });
    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      syncRef.current = () => {};
      fitRef.current = () => {};
      onReady(false);
    };
  }, [t, onReady]);

  return <div className={styles.mapFrame}>
    <div ref={containerRef} className={styles.map} role="region" aria-label={t('Route point editor map')} />
    <div className={styles.mapControls} role="group" aria-label={t('Map controls')}>
      <button type="button" aria-label={t('Zoom in')} disabled={!ready || failed || zoom >= 18} onClick={() => mapRef.current?.zoomIn()}><Plus size={19} aria-hidden="true" /></button>
      <button type="button" aria-label={t('Zoom out')} disabled={!ready || failed || zoom <= 2} onClick={() => mapRef.current?.zoomOut()}><Minus size={19} aria-hidden="true" /></button>
      <button type="button" aria-label={t('Fit route points')} disabled={!ready || failed} onClick={() => fitRef.current()}><RotateCcw size={18} aria-hidden="true" /></button>
    </div>
    {!ready && !failed && <p className={styles.mapStatus} role="status">{t('Loading map…')}</p>}
    {(failed || tileError) && <p className={styles.mapStatus} role={failed ? 'alert' : 'status'}>{t(failed ? 'The map could not load. Close this dialog and try again.' : 'The map background is unavailable. You can still edit the points.')}</p>}
  </div>;
}

export default function CmsRouteMapDialog({ sourceText, currentText, triggerRef, onClose, onApply }: {
  sourceText: string;
  currentText: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onApply: (text: string) => void;
}) {
  const { locale, t } = useCmsLocale();
  const id = useId();
  const [draft, setDraft] = useState(() => initialMapRouteText(sourceText));
  const [selected, setSelected] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const appliedRef = useRef(false);
  const stale = sourceText !== currentText;
  const rows = routeCoordinateRows(draft);
  const row = rows[selected];
  const selectedPoint = mapRoutePoints(draft)[selected];
  const valid = isMapRouteReady(draft);
  const move = useCallback((index: number, latitude: number, longitude: number) => {
    if (!stale) setDraft(previous => moveMapRoutePoint(previous, index, latitude, longitude));
  }, [stale]);

  function validation(field: 'latitude' | 'longitude', value: string) {
    if (!value.trim()) return '';
    const limit = field === 'latitude' ? 90 : 180;
    return Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit ? '' : t(field === 'latitude' ? 'Enter a latitude from −90 to 90.' : 'Enter a longitude from −180 to 180.');
  }
  function apply() {
    if (stale || !ready || !valid || appliedRef.current) return;
    appliedRef.current = true;
    try { onApply(draft); }
    catch (cause) { appliedRef.current = false; setError(cause instanceof Error ? cause.message : 'The map points could not be applied. Please try again.'); }
  }

  return <Dialog open title={t('Edit points on map')} closeLabel={t('Close dialog')} onClose={onClose} triggerRef={triggerRef} className={styles.dialog}>
    <div className={styles.body} onKeyDown={event => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); }
    }}>
      <p className={styles.hint} id={`${id}-hint`}>{t('Drag a point, or select a point and click the map to place it.')}</p>
      {stale && <p className={styles.error} role="alert">{t('The route points changed while this map was open. Close it and open the map again.')}</p>}
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      <fieldset className={styles.pointFields} disabled={stale}>
        <label className={styles.pointSelect} htmlFor={`${id}-point`}><span><MapPin size={18} aria-hidden="true" />{t('Selected point')}</span>
          <select id={`${id}-point`} value={selected} onChange={event => setSelected(Number(event.target.value))} aria-describedby={`${id}-hint`}>
            {rows.map((_, index) => <option key={index} value={index}>{index + 1}. {index === 0 ? t('Origin point') : index === rows.length - 1 ? t('Destination point') : t('Intermediate point {number}', { number: index })}</option>)}
          </select>
        </label>
        {row && (['latitude', 'longitude'] as const).map(field => {
          const message = validation(field, row[field]);
          return <label key={field} htmlFor={`${id}-${field}`}>{t(field === 'latitude' ? 'Latitude' : 'Longitude')}
            <input id={`${id}-${field}`} type="text" inputMode="decimal" lang="en" autoComplete="off" placeholder={cmsContentPlaceholder(field, locale)} value={row[field]} aria-label={t(field === 'latitude' ? 'Latitude' : 'Longitude')} aria-invalid={Boolean(message)} aria-describedby={message ? `${id}-${field}-error` : undefined} onChange={event => {
              const value = event.target.value;
              setError('');
              setDraft(previous => updateRouteCoordinate(previous, selected, field, value));
            }} />
            {message && <span className={styles.fieldError} id={`${id}-${field}-error`}>{message}</span>}
          </label>;
        })}
      </fieldset>
      {selectedPoint && <a className={styles.mapLink} href={googleMapsPointUrl(...selectedPoint)} target="_blank" rel="noopener noreferrer">{t('Open in Google Maps')}<ExternalLink size={17} aria-hidden="true" /></a>}
      <PointMap text={draft} selected={selected} disabled={stale} onSelect={setSelected} onMove={move} onReady={setReady} />
      {!valid && <p className={styles.hint}>{t('Set valid coordinates for every point before applying.')}</p>}
      <p className={styles.hint}>{t('Apply these points, then save the route.')}</p>
      <div className={styles.actions}><button type="button" className="button secondary" onClick={onClose}>{t('Cancel')}</button><button type="button" className="button" disabled={stale || !ready || !valid} onClick={apply}><Check size={18} aria-hidden="true" />{t('Use map points')}</button></div>
    </div>
  </Dialog>;
}

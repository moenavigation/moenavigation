'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, Check, MapPin, Minus, Plus, RotateCcw, Route } from 'lucide-react';
import type * as Leaflet from 'leaflet';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import type { ContentRecord } from '@/lib/cms-types';
import { routeCoordinateRows } from '@/lib/cms-route-fields';
import { googleMapsPointUrl } from '@/lib/google-maps';
import { applyGeneratedSeaRoute, isGeneratedSeaRoute, readSeaRouteEndpoints, type GeneratedSeaRoute } from '@/lib/sea-route';
import Dialog from './Dialog';
import CmsWorkingPanel from './CmsWorkingPanel';
import styles from './CmsSeaRouteDialog.module.css';

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const providerAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
const attribution = providerAttribution ? `${providerAttribution} · ${osmAttribution}` : osmAttribution;

function SeaRoutePreview({ waypoints, onReady }: Pick<GeneratedSeaRoute, 'waypoints'> & { onReady: (ready: boolean) => void }) {
  const { t, locale } = useCmsLocale();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let map: Leaflet.Map | undefined;
    async function initialize() {
      const leaflet = await import('leaflet');
      if (disposed || !containerRef.current) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map = leaflet.map(containerRef.current, { zoomControl: false, scrollWheelZoom: false, keyboard: true, zoomAnimation: !reduced, fadeAnimation: !reduced, markerZoomAnimation: !reduced, minZoom: 2, maxZoom: 13 });
      const currentMap = map;
      let panned = false;
      currentMap.on('dragstart', () => { panned = true; });
      currentMap.attributionControl.setPrefix(false);
      const tiles = leaflet.tileLayer(tileUrl, { attribution, maxZoom: 19 });
      let loaded = 0;
      let errors = 0;
      tiles.on('loading', () => { loaded = 0; errors = 0; });
      tiles.on('tileload', () => { loaded++; });
      tiles.on('tileerror', () => { errors++; });
      tiles.on('load', () => { if (!disposed) setTileError(errors > 0 && loaded === 0); });
      tiles.addTo(currentMap);
      leaflet.polyline(waypoints, { color: '#fff', weight: 8, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(currentMap);
      leaflet.polyline(waypoints, { color: '#0b527f', weight: 3.5, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(currentMap);
      waypoints.forEach((point, index) => {
        const endpoint = index === 0 || index === waypoints.length - 1;
        const label = index === 0 ? t('Origin point') : endpoint ? t('Destination point') : t('Intermediate point {number}', { number: index });
        const link = document.createElement('a');
        link.href = googleMapsPointUrl(...point);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.draggable = false;
        link.title = label;
        link.className = styles.pointLink;
        link.dataset.routePoint = index === 0 ? 'origin' : endpoint ? 'destination' : 'intermediate';
        link.setAttribute('aria-label', `${t('Open in Google Maps · {point}', { point: label })}${locale === 'th' ? ' (เปิดในแท็บใหม่)' : ' (opens in a new tab)'}`);
        const center = document.createElement('span');
        center.className = styles.pointCenter;
        center.setAttribute('aria-hidden', 'true');
        link.append(center);
        const marker = leaflet.marker(point, {
          icon: leaflet.divIcon({ className: styles.pointMarker, html: link, iconSize: [44, 44], iconAnchor: [22, 22] }),
          keyboard: false, zIndexOffset: endpoint ? 1000 : 0,
        }).addTo(currentMap);
        // Claim synthetic touch double-clicks here so point taps do not zoom the map.
        marker.on('dblclick', event => leaflet.DomEvent.stopPropagation(event.originalEvent));
        // Panning from a marker must not accidentally follow its outbound link.
        link.addEventListener('pointerenter', event => {
          if (event.pointerType === 'mouse' || event.pointerType === 'pen' && event.buttons === 0) link.dataset.hovered = 'true';
        });
        link.addEventListener('pointerleave', () => { delete link.dataset.hovered; });
        link.addEventListener('pointerdown', event => { panned = false; if (event.pointerType === 'touch') delete link.dataset.hovered; });
        link.addEventListener('click', event => { if (event.detail > 0 && panned) event.preventDefault(); });
        link.addEventListener('focus', () => { if (link.matches(':focus-visible')) currentMap.panInside(point, { padding: [32, 32], animate: false }); });
        if (endpoint) {
          const tooltip = document.createElement('span');
          tooltip.textContent = label;
          marker.bindTooltip(tooltip, { permanent: true, direction: 'top', offset: [0, -8] });
        }
      });
      const fit = () => currentMap.fitBounds(leaflet.latLngBounds(waypoints), { padding: [48, 52], maxZoom: 9, animate: false });
      fitRef.current = fit;
      mapRef.current = currentMap;
      fit();
      currentMap.on('zoomend', () => { if (!disposed) setZoom(currentMap.getZoom()); });
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => { currentMap.invalidateSize({ pan: false }); fit(); });
        observer.observe(containerRef.current);
      }
      setZoom(currentMap.getZoom());
      setReady(true);
      onReady(true);
    }
    void initialize().catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; observer?.disconnect(); map?.remove(); mapRef.current = null; fitRef.current = () => {}; onReady(false); };
  }, [waypoints, locale, onReady, t]);

  return <div className={styles.mapFrame}>
    <div ref={containerRef} className={styles.map} role="region" aria-label={t('Generated sea route map')} aria-describedby={descriptionId} />
    <span id={descriptionId} className={styles.srOnly}>{locale === 'th' ? 'จุดต้นทางและปลายทางแสดงอยู่เสมอ ชี้หรือโฟกัสที่จุดระหว่างทางเพื่อแสดงจุด แตะหรือกด Enter ที่จุดใดก็ได้เพื่อเปิด Google Maps ในแท็บใหม่' : 'Origin and destination stay visible. Hover or focus an intermediate point to reveal it. Tap or press Enter on any point to open Google Maps in a new tab.'}</span>
    <div className={styles.mapControls} role="group" aria-label={t('Map controls')}>
      <button type="button" aria-label={t('Zoom in')} disabled={!ready || failed || zoom >= 13} onClick={() => mapRef.current?.zoomIn()}><Plus size={19} aria-hidden="true" /></button>
      <button type="button" aria-label={t('Zoom out')} disabled={!ready || failed || zoom <= 2} onClick={() => mapRef.current?.zoomOut()}><Minus size={19} aria-hidden="true" /></button>
      <button type="button" aria-label={t('Fit generated route')} disabled={!ready || failed} onClick={() => fitRef.current()}><RotateCcw size={18} aria-hidden="true" /></button>
    </div>
    {!ready && !failed && <p className={styles.mapStatus} role="status">{t('Loading map…')}</p>}
    {(failed || tileError) && <p className={styles.mapStatus} role="status">{t(failed ? 'The preview map could not load. Close this preview and try again before applying.' : 'The map background is unavailable. The generated route is still shown.')}</p>}
  </div>;
}

export default function CmsSeaRouteDialog({ record, sourceText, currentText, triggerRef, onClose, onApply }: {
  record: ContentRecord;
  sourceText: string;
  currentText: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onApply: (result: GeneratedSeaRoute) => void;
}) {
  const { t, locale } = useCmsLocale();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState<GeneratedSeaRoute | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const appliedRef = useRef(false);
  const stale = currentText !== sourceText;
  const existingCount = Math.max(0, routeCoordinateRows(sourceText).length - 2);
  const portLabel = (side: 'origin' | 'destination') => {
    const port = record[side];
    return (locale === 'th' ? port?.nameTh || port?.name : port?.name || port?.nameTh) || t(side === 'origin' ? 'Origin point' : 'Destination point');
  };

  useEffect(() => {
    if (stale) return;
    const controller = new AbortController();
    requestRef.current = controller;
    // Queue the read so Strict Mode cleanup can cancel its trial mount.
    const timer = window.setTimeout(async () => {
      try {
        const endpoints = readSeaRouteEndpoints(sourceText);
        if (!endpoints) throw new Error('Enter valid, different origin and destination coordinates first.');
        const data = await cmsRequest<GeneratedSeaRoute>('/api/cms/routes/generate', { method: 'POST', body: JSON.stringify(endpoints), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) });
        if (controller.signal.aborted) return;
        if (!isGeneratedSeaRoute(data)) throw new Error('The generated sea route could not be read. Please try again.');
        // Validate the preview before showing it, using the same endpoint guard as Apply.
        applyGeneratedSeaRoute(sourceText, data);
        setResult(data);
      } catch (cause) { if (!controller.signal.aborted) setError(cmsErrorText(cause)); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [sourceText, attempt, stale]);

  function close() { requestRef.current?.abort(); onClose(); }
  function apply() {
    if (busy || stale || !result || !mapReady || appliedRef.current) return;
    appliedRef.current = true;
    try { onApply(result); }
    catch (cause) { appliedRef.current = false; setError(cmsErrorText(cause)); }
  }

  return <Dialog open title={t('Sea route preview')} closeLabel={t('Close sea route preview')} onClose={close} triggerRef={triggerRef} className={styles.dialog}>
    <div className={styles.body} onKeyDown={event => {
      // This nested dialog lives inside the route editor's form.
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); }
    }}>
      <div className={styles.endpoints}><MapPin size={20} aria-hidden="true" /><span>{portLabel('origin')}<span className={styles.to}>{t('to')}</span>{portLabel('destination')}</span></div>
      <p className={styles.hint}>{t('Generate intermediate points between your origin and destination. Review the preview before applying.')}</p>
      <CmsWorkingPanel active={busy && !stale} title="Generating sea route…" description="Finding a sea path and checking it against mapped land." />
      {stale ? <p className={styles.error} role="alert">{t('The route points changed while this preview was open. Close it and generate a new preview.')}</p> : error && <div className={styles.error} role="alert"><p>{t(error)}</p><button type="button" className={styles.retry} disabled={busy} onClick={() => { requestRef.current?.abort(); setError(''); setResult(null); setBusy(true); setAttempt(value => value + 1); }}>{t('Try again')}</button></div>}
      {result && !stale && <section className={styles.preview} aria-label={t('Generated route')}>
        <div className={styles.previewHeading}><h3><Route size={20} aria-hidden="true" />{t('Generated route')}</h3><span className={styles.ready} role="status"><Check size={17} aria-hidden="true" />{t('Ready to review')}</span></div>
        {result.touchesLand && <p className={styles.landNote} role="note"><AlertTriangle size={20} aria-hidden="true" /><span>{t('This route touches land in the available map data. Review and adjust the points before saving.')}</span></p>}
        <dl className={styles.metrics}>
          <div><dt>{t('Intermediate points')}</dt><dd>{new Intl.NumberFormat(locale).format(result.waypoints.length - 2)}</dd></div>
          <div><dt>{t('Approximate distance')}</dt><dd>{t('{distance} km', { distance: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(result.distanceKm) })}</dd></div>
        </dl>
        <SeaRoutePreview waypoints={result.waypoints} onReady={setMapReady} />
      </section>}
      <p className={styles.note}>{t('Approximate website route. Review coastal areas before saving. Not for navigation.')}</p>
      <p className={styles.hint}>{existingCount > 0 ? t('Applying replaces {count} existing intermediate points. Your origin and destination stay unchanged.', { count: existingCount }) : t('Your origin and destination stay unchanged. Generated points are added between them.')}</p>
      <p className={styles.hint}>{t('Apply the points, then save the route when you are ready.')}</p>
      <div className={styles.actions}><button type="button" className="button secondary" onClick={close}>{t('Cancel')}</button><button type="button" className="button" disabled={busy || stale || !result || !mapReady} onClick={apply}><Check size={18} aria-hidden="true" />{t('Use generated points')}</button></div>
    </div>
  </Dialog>;
}

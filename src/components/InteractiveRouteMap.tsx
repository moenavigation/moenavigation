"use client";

import "leaflet/dist/leaflet.css";

import { Globe2, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { local, type Locale } from "@/lib/content";
import styles from "./InteractiveRouteMap.module.css";
import type * as Leaflet from "leaflet";
import type { ContentRecord, RoutePort } from "@/lib/cms-types";

export type MappedRoute = ContentRecord & { origin: RoutePort; destination: RoutePort; waypoints: [number, number][] };

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const providerAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
const attribution = providerAttribution ? `${providerAttribution} · ${osmAttribution}` : osmAttribution;

type Props = {
  locale: Locale;
  selectedId: string;
  routes: MappedRoute[];
  onSelect: (id: string) => void;
};

export default function InteractiveRouteMap({ locale, selectedId, routes, onSelect }: Props) {
  const descriptionId = useId();
  const availableKey = JSON.stringify(routes);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const overlaysRef = useRef<Leaflet.LayerGroup | null>(null);
  const lastFittedRef = useRef<{ mapVersion: number; id: string; availableKey: string } | null>(null);
  const selectedIdRef = useRef(selectedId);
  const routesRef = useRef(routes);
  const [mapVersion, setMapVersion] = useState(0);
  const [zoom, setZoom] = useState(5);
  const [tileError, setTileError] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { routesRef.current = routes; }, [routes]);

  const fitRoute = (id: string, animate: boolean) => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;
    const route = routesRef.current.find((item) => item.id === id);
    if (!route) return;
    const compact = window.matchMedia("(max-width: 520px)").matches;
    map.fitBounds(leaflet.latLngBounds(route.waypoints), {
      paddingTopLeft: compact ? [24, 24] : [36, 36],
      paddingBottomRight: compact ? [24, 180] : [36, 36],
      maxZoom: 7,
      animate: animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  };

  const fitAllPorts = () => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;
    const points = routesRef.current.flatMap((route) => route.waypoints);
    if (!points.length) return;
    const compact = window.matchMedia("(max-width: 520px)").matches;
    map.fitBounds(leaflet.latLngBounds(points), {
      paddingTopLeft: compact ? [24, 24] : [36, 36],
      paddingBottomRight: compact ? [24, 180] : [36, 36],
      maxZoom: 6,
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  };

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame: number | null = null;
    let map: Leaflet.Map | null = null;

    async function initialize() {
      const leaflet = await import("leaflet");
      if (disposed || !containerRef.current) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map = leaflet.map(containerRef.current, {
        zoomControl: false,
        // Scrolling through the page should not unexpectedly change the map.
        // Buttons, keyboard and pinch zoom remain available.
        scrollWheelZoom: false,
        keyboard: true,
        zoomAnimation: !reducedMotion,
        fadeAnimation: !reducedMotion,
        markerZoomAnimation: !reducedMotion,
        minZoom: 3,
        maxZoom: 12,
      }).setView(routesRef.current[0].waypoints[0], 5);
      map.attributionControl.setPrefix(false);

      const tiles = leaflet.tileLayer(tileUrl, { attribution, maxZoom: 19 });
      let loadedTiles = 0;
      let failedTiles = 0;
      tiles.on("loading", () => { loadedTiles = 0; failedTiles = 0; });
      tiles.on("tileload", () => { loadedTiles += 1; });
      tiles.on("tileerror", () => { failedTiles += 1; });
      tiles.on("load", () => { if (!disposed) setTileError(failedTiles > 0 && loadedTiles === 0); });
      tiles.addTo(map);

      const currentMap = map;
      currentMap.on("zoomend", () => { if (!disposed) setZoom(currentMap.getZoom()); });
      mapRef.current = currentMap;
      leafletRef.current = leaflet;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          currentMap.invalidateSize({ pan: false });
          fitRoute(selectedIdRef.current, false);
        });
        resizeObserver.observe(containerRef.current);
      }
      resizeFrame = requestAnimationFrame(() => currentMap.invalidateSize({ pan: false }));
      setMapVersion((version) => version + 1);
    }

    void initialize().catch(() => { if (!disposed) setMapFailed(true); });
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      overlaysRef.current = null;
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;

    const focusedRouteId = (document.activeElement as HTMLElement | null)?.dataset.routeId;
    overlaysRef.current?.remove();
    const overlays = leaflet.layerGroup().addTo(map);
    overlaysRef.current = overlays;
    const createIcon = (kind: "origin" | "destination" | "active") => leaflet.divIcon({
      className: `${styles.portMarker} ${kind === "origin" ? styles.originMarker : kind === "active" ? styles.activeMarker : styles.destinationMarker}`,
      html: `<span class="${styles.markerCenter}"></span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const visibleRoutes: MappedRoute[] = JSON.parse(availableKey);
    const tooltip = (text: string) => { const label = document.createElement("span"); label.textContent = text; return label; };
    const shownOrigins = new Set<string>();
    for (const route of visibleRoutes) {
      const origin = route.waypoints[0];
      const originKey = origin.join(",");
      if (!shownOrigins.has(originKey)) {
        shownOrigins.add(originKey);
        const originName = local(locale,route.origin.name,route.origin.nameTh);
        const originMarker = leaflet.marker(origin, { icon: createIcon("origin"), interactive: false, keyboard: false, title: originName }).addTo(overlays);
        originMarker.bindTooltip(tooltip(originName), { permanent: true, direction: "right", offset: [8, 0], className: styles.portTooltip });
      }
      const id = route.id;
      const label = local(locale, route.destination.name, route.destination.nameTh);
      const action = local(locale, `Select route to ${label}`, `เลือกเส้นทางไป${label}`);
      const destination = route.waypoints[route.waypoints.length - 1];
      const labelOnLeft = destination[1] < visibleRoutes.reduce((sum,item) => sum + item.waypoints[item.waypoints.length-1][1],0) / visibleRoutes.length;
      const marker = leaflet.marker(destination, {
        icon: createIcon(id === selectedId ? "active" : "destination"),
        title: action,
        keyboard: true,
        riseOnHover: true,
      }).addTo(overlays);
      marker.bindTooltip(tooltip(label), id === selectedId
        ? { permanent: true, direction: labelOnLeft ? "left" : "right", offset: [labelOnLeft ? -8 : 8, 0], className: styles.portTooltip }
        : { direction: "top", offset: [0, -8], className: styles.hoverTooltip });
      marker.on("click", () => { if (id === selectedId) fitRoute(id, true); else onSelect(id); });
      const element = marker.getElement();
      if (element) {
        element.dataset.routeId = id;
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", action);
        element.setAttribute("aria-pressed", String(id === selectedId));
        element.addEventListener("keydown", (event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            if (id === selectedId) fitRoute(id, true); else onSelect(id);
          }
        });
        if (focusedRouteId === id) element.focus({ preventScroll: true });
      }
    }

    const selected = visibleRoutes.find((route) => route.id === selectedId);
    if (selected) {
      const points = selected.waypoints;
      leaflet.polyline(points, { color: "#fff", weight: 10, opacity: 0.92, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(overlays);
      leaflet.polyline(points, { color: "#0b527f", weight: 4, opacity: 0.96, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(overlays);
      const lastFitted = lastFittedRef.current;
      if (!lastFitted || lastFitted.id !== selectedId || lastFitted.mapVersion !== mapVersion || lastFitted.availableKey !== availableKey) {
        fitRoute(selectedId, lastFitted !== null);
        lastFittedRef.current = { id: selectedId, mapVersion, availableKey };
      }
    }
  }, [availableKey, locale, mapVersion, onSelect, selectedId]);

  const selected = routes.find((route) => route.id === selectedId) || routes[0];
  const selectedName = local(locale, selected.destination.name, selected.destination.nameTh);
  const originName = local(locale, selected.origin.name, selected.origin.nameTh);
  const mapLabel = local(locale, `Interactive map of an illustrative route from ${originName} to ${selectedName}`, `แผนที่แบบโต้ตอบของเส้นทางตัวอย่างจาก${originName}ไป${selectedName}`);
  const controlsDisabled = mapVersion === 0 || mapFailed;

  return <div className={styles.shell}>
    <div ref={containerRef} className={styles.viewport} role="region" aria-label={mapLabel} aria-describedby={descriptionId} />
    {!mapVersion && !mapFailed && <p className={styles.loading} role="status">{local(locale, "Loading map…", "กำลังโหลดแผนที่…")}</p>}
    <div className={styles.notice} aria-hidden="true">
      <span className={styles.noticeEyebrow}>{local(locale, "Selected route", "เส้นทางที่เลือก")}</span>
      <strong>{originName} → {selectedName}</strong>
      <span className={styles.noticeCaveat}>{local(locale, "Illustrative · Not for navigation", "ตัวอย่าง · ไม่ใช้เพื่อการนำทาง")}</span>
    </div>
    <div className={styles.controls} role="group" aria-label={local(locale, "Map controls", "ตัวควบคุมแผนที่")}>
      <button type="button" disabled={controlsDisabled || zoom >= 12} onClick={() => mapRef.current?.zoomIn()} aria-label={local(locale, "Zoom in", "ขยายแผนที่")}><Plus size={20} aria-hidden="true" /></button>
      <button type="button" disabled={controlsDisabled || zoom <= 3} onClick={() => mapRef.current?.zoomOut()} aria-label={local(locale, "Zoom out", "ย่อแผนที่")}><Minus size={20} aria-hidden="true" /></button>
      <button type="button" disabled={controlsDisabled} onClick={() => fitRoute(selectedId, true)} aria-label={local(locale, "Fit selected route", "แสดงเส้นทางที่เลือกทั้งหมด")}><RotateCcw size={18} aria-hidden="true" /></button>
      <button type="button" disabled={controlsDisabled} onClick={fitAllPorts} aria-label={local(locale, "Show all ports", "แสดงท่าเรือทั้งหมด")}><Globe2 size={19} aria-hidden="true" /></button>
    </div>
    {(tileError || mapFailed) && <p className={styles.tileError} role="status">{mapFailed ? local(locale, "The map is unavailable. You can still choose a route from the list.", "ไม่สามารถโหลดแผนที่ได้ คุณยังเลือกเส้นทางจากรายการได้") : local(locale, "The map background is unavailable. Route markers and controls still work.", "ไม่สามารถโหลดพื้นหลังแผนที่ได้ จุดท่าเรือและปุ่มควบคุมยังใช้งานได้")}</p>}
    <span id={descriptionId} className={styles.srOnly}>{local(locale, "Use the arrow keys to move the map and plus or minus to zoom. Choose a destination marker or a route in the list. This is an illustrative overview, not a navigational chart or confirmed sailing route.", "ใช้แป้นลูกศรเพื่อเลื่อนแผนที่ และปุ่มบวกหรือลบเพื่อปรับขนาด เลือกจุดท่าเรือปลายทางหรือเส้นทางในรายการ แผนที่นี้ใช้ประกอบการนำเสนอ ไม่ใช่แผนที่เดินเรือหรือเส้นทางเดินเรือที่ยืนยันแล้ว")}</span>
  </div>;
}

"use client";

import "leaflet/dist/leaflet.css";

import { Globe2, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { local, type Locale } from "@/lib/content";
import styles from "./InteractiveRouteMap.module.css";
import type * as Leaflet from "leaflet";

export type RouteId = "singapore" | "port-klang" | "tanjung-priok";

type Point = [number, number];
type Route = { destination: { en: string; th: string }; points: Point[] };

const origin: Point = [13.0833, 100.8833];
const gulf: Point[] = [origin, [11.8, 100.8], [9.8, 101.1], [7.7, 102.0], [5.6, 103.3], [3.4, 104.0]];

// The waypoints suggest geographic connections; they are not surveyed sailing tracks.
const routes: Record<RouteId, Route> = {
  singapore: {
    destination: { en: "Singapore", th: "สิงคโปร์" },
    points: [...gulf, [2.1, 104.1], [1.17, 104.15], [1.16, 103.95], [1.2, 103.8], [1.2662, 103.7802]],
  },
  "port-klang": {
    destination: { en: "Port Klang", th: "ท่าเรือคลัง" },
    points: [...gulf, [2.1, 104.1], [1.17, 104.15], [1.14, 103.78], [1.2, 103.55], [1.5, 103.1], [2.15, 102.35], [2.75, 101.65], [3.0, 101.4]],
  },
  "tanjung-priok": {
    destination: { en: "Tanjung Priok", th: "ตันจุงปริอ็อก" },
    points: [...gulf, [1.6, 104.4], [0.2, 105.8], [-1.2, 107.4], [-2.8, 108.7], [-4.3, 108.6], [-5.4, 107.6], [-6.0803, 106.8803]],
  },
};

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const providerAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
const attribution = providerAttribution ? `${providerAttribution} · ${osmAttribution}` : osmAttribution;

type Props = {
  locale: Locale;
  selectedId: RouteId;
  availableIds: readonly RouteId[];
  onSelect: (id: RouteId) => void;
};

export default function InteractiveRouteMap({ locale, selectedId, availableIds, onSelect }: Props) {
  const descriptionId = useId();
  const availableKey = availableIds.join("|");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const overlaysRef = useRef<Leaflet.LayerGroup | null>(null);
  const lastFittedRef = useRef<{ mapVersion: number; id: RouteId; availableKey: string } | null>(null);
  const selectedIdRef = useRef(selectedId);
  const availableKeyRef = useRef(availableKey);
  const [mapVersion, setMapVersion] = useState(0);
  const [zoom, setZoom] = useState(5);
  const [tileError, setTileError] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { availableKeyRef.current = availableKey; }, [availableKey]);

  const fitRoute = (id: RouteId, animate: boolean) => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;
    const compact = window.matchMedia("(max-width: 520px)").matches;
    const points = compact
      ? [...routes[id].points, ...(availableKeyRef.current.split("|").filter(Boolean) as RouteId[]).map((routeId) => routes[routeId].points[routes[routeId].points.length - 1])]
      : routes[id].points;
    map.fitBounds(leaflet.latLngBounds(points), {
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
    const ids = availableKey ? availableKey.split("|") as RouteId[] : [];
    const points = [origin, ...ids.flatMap((id) => routes[id].points)];
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
    let compactViewport: MediaQueryList | null = null;
    let updateWheelZoom: (() => void) | null = null;

    async function initialize() {
      const leaflet = await import("leaflet");
      if (disposed || !containerRef.current) return;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      compactViewport = window.matchMedia("(max-width: 520px)");
      map = leaflet.map(containerRef.current, {
        zoomControl: false,
        scrollWheelZoom: !compactViewport.matches,
        keyboard: true,
        zoomAnimation: !reducedMotion,
        fadeAnimation: !reducedMotion,
        markerZoomAnimation: !reducedMotion,
        minZoom: 3,
        maxZoom: 12,
      }).setView([5, 104], 5);
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
      updateWheelZoom = () => {
        if (compactViewport?.matches) currentMap.scrollWheelZoom.disable();
        else currentMap.scrollWheelZoom.enable();
      };
      compactViewport.addEventListener("change", updateWheelZoom);
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
      if (compactViewport && updateWheelZoom) compactViewport.removeEventListener("change", updateWheelZoom);
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

    const originName = local(locale, "Laem Chabang, Thailand", "แหลมฉบัง ประเทศไทย");
    const originMarker = leaflet.marker(origin, { icon: createIcon("origin"), interactive: false, keyboard: false, title: originName }).addTo(overlays);
    originMarker.bindTooltip(originName, { permanent: true, direction: "right", offset: [8, 0], className: styles.portTooltip });

    const visibleIds = availableKey ? availableKey.split("|") as RouteId[] : [];
    for (const id of visibleIds) {
      const route = routes[id];
      const label = local(locale, route.destination.en, route.destination.th);
      const action = local(locale, `Select route to ${label}`, `เลือกเส้นทางไป${label}`);
      const marker = leaflet.marker(route.points[route.points.length - 1], {
        icon: createIcon(id === selectedId ? "active" : "destination"),
        title: action,
        keyboard: true,
        riseOnHover: true,
      }).addTo(overlays);
      marker.bindTooltip(label, id === selectedId
        ? { permanent: true, direction: id === "port-klang" ? "left" : "right", offset: [id === "port-klang" ? -8 : 8, 0], className: styles.portTooltip }
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

    if (visibleIds.includes(selectedId)) {
      const points = routes[selectedId].points;
      leaflet.polyline(points, { color: "#fff", weight: 10, opacity: 0.92, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(overlays);
      leaflet.polyline(points, { color: "#0b527f", weight: 4, opacity: 0.96, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(overlays);
      const lastFitted = lastFittedRef.current;
      if (!lastFitted || lastFitted.id !== selectedId || lastFitted.mapVersion !== mapVersion || lastFitted.availableKey !== availableKey) {
        fitRoute(selectedId, lastFitted !== null);
        lastFittedRef.current = { id: selectedId, mapVersion, availableKey };
      }
    }
  }, [availableKey, locale, mapVersion, onSelect, selectedId]);

  const selectedName = local(locale, routes[selectedId].destination.en, routes[selectedId].destination.th);
  const mapLabel = local(locale, `Interactive map of an illustrative route from Laem Chabang to ${selectedName}`, `แผนที่แบบโต้ตอบของเส้นทางตัวอย่างจากแหลมฉบังไป${selectedName}`);

  return <div className={styles.shell}>
    <div ref={containerRef} className={styles.viewport} role="region" aria-label={mapLabel} aria-describedby={descriptionId} />
    {!mapVersion && !mapFailed && <p className={styles.loading} role="status">{local(locale, "Loading map…", "กำลังโหลดแผนที่…")}</p>}
    <div className={styles.notice} aria-hidden="true">
      <span className={styles.noticeEyebrow}>{local(locale, "Selected route", "เส้นทางที่เลือก")}</span>
      <strong>{local(locale, `Laem Chabang → ${selectedName}`, `แหลมฉบัง → ${selectedName}`)}</strong>
      <span className={styles.noticeCaveat}>{local(locale, "Illustrative · Not for navigation", "ตัวอย่าง · ไม่ใช้เพื่อการนำทาง")}</span>
    </div>
    <div className={styles.controls} role="group" aria-label={local(locale, "Map controls", "ตัวควบคุมแผนที่")}>
      <button type="button" disabled={zoom >= 12} onClick={() => mapRef.current?.zoomIn()} aria-label={local(locale, "Zoom in", "ขยายแผนที่")}><Plus size={20} aria-hidden="true" /></button>
      <button type="button" disabled={zoom <= 3} onClick={() => mapRef.current?.zoomOut()} aria-label={local(locale, "Zoom out", "ย่อแผนที่")}><Minus size={20} aria-hidden="true" /></button>
      <button type="button" onClick={() => fitRoute(selectedId, true)} aria-label={local(locale, "Fit selected route", "แสดงเส้นทางที่เลือกทั้งหมด")}><RotateCcw size={18} aria-hidden="true" /></button>
      <button type="button" onClick={fitAllPorts} aria-label={local(locale, "Show all ports", "แสดงท่าเรือทั้งหมด")}><Globe2 size={19} aria-hidden="true" /></button>
    </div>
    {(tileError || mapFailed) && <p className={styles.tileError} role="status">{local(locale, "Map background is unavailable. Check your connection.", "ไม่สามารถโหลดพื้นหลังแผนที่ได้ โปรดตรวจสอบการเชื่อมต่อ")}</p>}
    <span id={descriptionId} className={styles.srOnly}>{local(locale, "This is an illustrative geographic overview, not a navigational chart or confirmed sailing route.", "ภาพรวมภูมิศาสตร์นี้ใช้เพื่อประกอบการนำเสนอ ไม่ใช่แผนที่เดินเรือหรือเส้นทางเดินเรือที่ยืนยันแล้ว")}</span>
  </div>;
}

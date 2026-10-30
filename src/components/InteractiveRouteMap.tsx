"use client";

import "leaflet/dist/leaflet.css";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { local, type Locale } from "@/lib/content";
import styles from "./InteractiveRouteMap.module.css";
import type * as Leaflet from "leaflet";
import type { MappedRoute } from "@/lib/route-explorer";
import { contentText } from "@/lib/public-content";

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const providerAttribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;
const attribution = providerAttribution ? `${providerAttribution} · ${osmAttribution}` : osmAttribution;

type Props = {
  locale: Locale;
  selectedId: string;
  routes: MappedRoute[];
  onSelect: (id: string) => void;
  deferUntilVisible?: boolean;
};

export default function InteractiveRouteMap({ locale, selectedId, routes, onSelect, deferUntilVisible = false }: Props) {
  const descriptionId = useId();
  const availableKey = JSON.stringify(routes.map(({ id, title, titleTh, origin, destination, waypoints }) => ({ id, title, titleTh, origin, destination, waypoints })));
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const overlaysRef = useRef<Leaflet.LayerGroup | null>(null);
  const lastFittedRef = useRef<{ mapVersion: number; id: string; geometry: string } | null>(null);
  const selectedIdRef = useRef(selectedId);
  const routesRef = useRef(routes);
  const [mapVersion, setMapVersion] = useState(0);
  const [zoom, setZoom] = useState(5);
  const [tileError, setTileError] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [portChoices, setPortChoices] = useState<{ portKey: string; routeIds: string[]; title: string; availableKey: string } | null>(null);
  const choicesRef = useRef<HTMLDivElement>(null);

  const restorePortFocus = (portKey: string) => {
    const marker = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-port-key]") || []).find(element => element.dataset.portKey === portKey);
    marker?.focus({ preventScroll: true });
  };
  const closePortChoices = () => {
    if (portChoices) restorePortFocus(portChoices.portKey);
    setPortChoices(null);
  };

  useEffect(() => {
    if (!portChoices) return;
    choicesRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !choicesRef.current?.contains(event.target)) setPortChoices(null);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
    };
  }, [portChoices]);

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
      paddingBottomRight: compact ? [24, 80] : [36, 60],
      maxZoom: 7,
      animate: animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  };

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame: number | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
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
      const currentMap = map;
      currentMap.attributionControl.setPrefix(false);
      const tiles = leaflet.tileLayer(tileUrl, { attribution, maxZoom: 19 });
      let loadedTiles = 0;
      let failedTiles = 0;
      tiles.on("loading", () => { loadedTiles = 0; failedTiles = 0; });
      tiles.on("tileload", () => { loadedTiles += 1; });
      tiles.on("tileerror", () => { failedTiles += 1; });
      tiles.on("load", () => { if (!disposed) setTileError(failedTiles > 0 && loadedTiles === 0); });
      tiles.addTo(currentMap);
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

    const start = () => { void initialize().catch(() => { if (!disposed) setMapFailed(true); }); };
    if (deferUntilVisible && typeof IntersectionObserver !== "undefined" && containerRef.current) {
      visibilityObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          visibilityObserver?.disconnect();
          start();
        }
      }, { rootMargin: "240px" });
      visibilityObserver.observe(containerRef.current);
    } else {
      start();
    }
    return () => {
      disposed = true;
      visibilityObserver?.disconnect();
      resizeObserver?.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      overlaysRef.current = null;
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [deferUntilVisible]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = leafletRef.current;
    if (!map || !leaflet) return;

    const focusedPortKey = (document.activeElement as HTMLElement | null)?.dataset.portKey;
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
    // One marker per destination avoids stacked controls when connections share a port.
    const ports = new Map<string, MappedRoute[]>();
    for (const route of visibleRoutes) {
      const key = route.waypoints.at(-1)!.join(",");
      const group = ports.get(key) || [];
      group.push(route);
      ports.set(key, group);
    }
    const centerLongitude = visibleRoutes.reduce((sum, route) => sum + route.waypoints.at(-1)![1], 0) / visibleRoutes.length;
    for (const [portKey, connections] of ports) {
      const active = connections.find(route => route.id === selectedId);
      const route = active || connections[0];
      const label = local(locale, route.destination.name, route.destination.nameTh);
      const action = connections.length === 1
        ? local(locale, `Select connection to ${label}`, `เลือกเส้นทางเชื่อมต่อไป${label}`)
        : local(locale, `${connections.length} connections to ${label}`, `${connections.length} เส้นทางเชื่อมต่อไป${label}`);
      const destination = route.waypoints.at(-1)!;
      const labelOnLeft = destination[1] < centerLongitude;
      const marker = leaflet.marker(destination, {
        icon: createIcon(active ? "active" : "destination"),
        title: action,
        keyboard: true,
        riseOnHover: true,
      }).addTo(overlays);
      marker.bindTooltip(tooltip(label), active
        ? { permanent: true, direction: labelOnLeft ? "left" : "right", offset: [labelOnLeft ? -8 : 8, 0], className: styles.portTooltip }
        : { direction: "top", offset: [0, -8], className: styles.hoverTooltip });
      const choose = (id: string) => {
        marker.getElement()?.focus({ preventScroll: true });
        if (id === selectedId) fitRoute(id, true); else onSelect(id);
      };
      const openChoices = connections.length > 1 ? () => setPortChoices({ portKey, routeIds: connections.map(connection => connection.id), title: action, availableKey }) : undefined;
      marker.on("click", () => { if (openChoices) openChoices(); else choose(route.id); });
      const element = marker.getElement();
      if (element) {
        element.dataset.portKey = portKey;
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", action);
        element.setAttribute("aria-pressed", String(Boolean(active)));
        if (connections.length > 1) element.setAttribute("aria-haspopup", "dialog");
        element.addEventListener("keydown", (event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (openChoices) openChoices(); else choose(route.id);
          }
        });
        if (focusedPortKey === portKey) element.focus({ preventScroll: true });
      }
    }

    const selected = visibleRoutes.find((route) => route.id === selectedId);
    if (selected) {
      const originName = local(locale, selected.origin.name, selected.origin.nameTh);
      const originMarker = leaflet.marker(selected.waypoints[0], { icon: createIcon("origin"), interactive: false, keyboard: false, title: originName, zIndexOffset: 100 }).addTo(overlays);
      originMarker.bindTooltip(tooltip(originName), { permanent: true, direction: "right", offset: [8, 0], className: styles.portTooltip });
      const points = selected.waypoints;
      leaflet.polyline(points, { color: "#fff", weight: 10, opacity: 0.92, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(overlays);
      leaflet.polyline(points, { color: "#0b527f", weight: 4, opacity: 0.96, interactive: false, lineCap: "round", lineJoin: "round" }).addTo(overlays);
      const lastFitted = lastFittedRef.current;
      const geometry = JSON.stringify(points);
      if (!lastFitted || lastFitted.id !== selectedId || lastFitted.mapVersion !== mapVersion || lastFitted.geometry !== geometry) {
        fitRoute(selectedId, lastFitted !== null);
        lastFittedRef.current = { id: selectedId, mapVersion, geometry };
      }
    }
  }, [availableKey, locale, mapVersion, onSelect, selectedId]);

  const selected = routes.find((route) => route.id === selectedId) || routes[0];
  const selectedName = local(locale, selected.destination.name, selected.destination.nameTh);
  const originName = local(locale, selected.origin.name, selected.origin.nameTh);
  const mapLabel = local(locale, `Interactive map of a connection between ${originName} and ${selectedName}`, `แผนที่แสดงการเชื่อมต่อระหว่าง${originName}กับ${selectedName}`);
  const controlsDisabled = mapVersion === 0 || mapFailed;

  return <div className={styles.shell}>
    <div className={styles.canvas}>
      <div ref={containerRef} className={styles.viewport} role="region" aria-label={mapLabel} aria-describedby={descriptionId} />
      {!mapVersion && !mapFailed && <p className={styles.loading} role="status">{local(locale, "Loading map…", "กำลังโหลดแผนที่…")}</p>}
      <div className={styles.notice} aria-hidden="true">
        <strong>{originName} → {selectedName}</strong>
      </div>
      <div className={styles.controls} role="group" aria-label={local(locale, "Map controls", "ตัวควบคุมแผนที่")}>
        <button type="button" disabled={controlsDisabled || zoom >= 12} onClick={() => mapRef.current?.zoomIn()} aria-label={local(locale, "Zoom in", "ขยายแผนที่")}><Plus size={20} aria-hidden="true" /></button>
        <button type="button" disabled={controlsDisabled || zoom <= 3} onClick={() => mapRef.current?.zoomOut()} aria-label={local(locale, "Zoom out", "ย่อแผนที่")}><Minus size={20} aria-hidden="true" /></button>
        <button type="button" disabled={controlsDisabled} onClick={() => fitRoute(selectedId, true)} aria-label={local(locale, "Fit selected route", "แสดงเส้นทางที่เลือกให้ครบ")}><RotateCcw size={18} aria-hidden="true" /></button>
      </div>
      {portChoices?.availableKey === availableKey && <div ref={choicesRef} className={styles.portChoices} role="dialog" aria-label={portChoices.title} onBlurCapture={event => {
        // Safari may focus the containing main element when clicking a button.
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next) && !next.contains(event.currentTarget)) setPortChoices(null);
      }} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePortChoices(); }
      }}>
        <strong>{portChoices.title}</strong>
        {portChoices.routeIds.map(id => routes.find(route => route.id === id)).filter((route): route is MappedRoute => Boolean(route)).map(route => <button key={route.id} type="button" aria-pressed={route.id === selectedId} onClick={() => {
          closePortChoices();
          if (route.id === selectedId) fitRoute(route.id, true); else onSelect(route.id);
        }}>{contentText(route, "title", locale)}</button>)}
        <button className={styles.popupClose} type="button" onClick={closePortChoices} aria-label={local(locale, "Close route choices", "ปิดตัวเลือกเส้นทาง")}>{local(locale, "Close", "ปิด")}</button>
      </div>}
      {(tileError || mapFailed) && <p className={styles.tileError} role="status">{mapFailed ? local(locale, "The map is unavailable. You can still choose a route from the list.", "ไม่สามารถโหลดแผนที่ได้ คุณยังเลือกเส้นทางจากรายการได้") : local(locale, "The map background is unavailable. Route markers and controls still work.", "ไม่สามารถโหลดพื้นหลังแผนที่ได้ จุดท่าเรือและปุ่มควบคุมยังใช้งานได้")}</p>}
      <span id={descriptionId} className={styles.srOnly}>{local(locale, "Use the arrow keys to move the map and plus or minus to zoom. Choose a destination marker or a connection in the list. The map shows approximate connections for enquiry planning. It is not a navigational chart and does not confirm sailing routes, timing or service availability.", "ใช้แป้นลูกศรเลื่อนแผนที่ และปุ่มบวกหรือลบเพื่อขยายหรือย่อ เลือกท่าเรือปลายทางบนแผนที่หรือเลือกเส้นทางจากรายการ แผนที่แสดงการเชื่อมต่อโดยประมาณเพื่อประกอบการสอบถาม ไม่ใช่แผนที่สำหรับเดินเรือ และไม่ได้ยืนยันเส้นทางเดินเรือ ช่วงเวลา หรือความพร้อมให้บริการ")}</span>
    </div>
  </div>;
}

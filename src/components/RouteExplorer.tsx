"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Compass, Container, ExternalLink, MapPin, RotateCcw, Ruler, Search, Ship, X } from "lucide-react";
import Link from "./NavigationLink";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord, RoutePort } from "@/lib/cms-types";
import { contentText } from "@/lib/public-content";
import { emptyRouteFilters, filterMappedRoutes, getRoutePage, routePortOptions, ROUTE_PAGE_SIZE, type MappedRoute, type RouteFilters } from "@/lib/route-explorer";
import { listingQueryLimit } from "@/lib/listing-filters";
import { googleMapsPointUrl } from "@/lib/google-maps";
import InteractiveRouteMap from "./InteractiveRouteMap";
import SelectionDialog from "./SelectionDialog";
import Pagination from "./Pagination";
import { ContentBody } from "./EditorialContent";
import styles from "./RoutesPage.module.css";

export function isMappedRoute(route: ContentRecord): route is MappedRoute {
  return !!route.origin && !!route.destination && !!route.waypoints && route.waypoints.length >= 2;
}

type Props = {
  locale: Locale;
  routes: MappedRoute[];
  selectedId: string;
  onSelect: (id: string) => void;
  filters?: RouteFilters;
  onFiltersChange?: (filters: RouteFilters) => void;
  deferMap?: boolean;
};

export default function RouteExplorer({ locale, routes, selectedId, onSelect, filters, onFiltersChange, deferMap = false }: Props) {
  const routeGroupId = useId(), detailsId = useId(), searchId = useId(), originId = useId(), destinationId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const mapColumnRef = useRef<HTMLDivElement>(null);
  const [localFilters, setLocalFilters] = useState<RouteFilters>(emptyRouteFilters);
  const sourceFilters = filters || localFilters;
  const updateFilters = (next: RouteFilters) => onFiltersChange ? onFiltersChange(next) : setLocalFilters(next);
  const showMap = () => mapColumnRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  const selectRoute = (id: string) => { onSelect(id); showMap(); };
  const route = routes.find((item) => item.id === selectedId) || routes[0];
  const origins = useMemo(() => routePortOptions(routes, "origin", locale), [routes, locale]);
  const destinations = useMemo(() => routePortOptions(routes, "destination", locale), [routes, locale]);
  const currentFilters = useMemo(() => ({
    ...sourceFilters,
    origin: origins.some(port => port.value === sourceFilters.origin) ? sourceFilters.origin : "",
    destination: destinations.some(port => port.value === sourceFilters.destination) ? sourceFilters.destination : "",
  }), [sourceFilters, origins, destinations]);
  const filtered = useMemo(() => filterMappedRoutes(routes, currentFilters), [routes, currentFilters]);
  const result = getRoutePage(filtered, currentFilters.page);
  // Bound map markers to this result page while keeping the selected connection visible.
  const mapRoutes = useMemo(() => {
    const items = getRoutePage(filtered, currentFilters.page).items;
    return route && !items.some(item => item.id === route.id) ? [...items, route] : items;
  }, [filtered, currentFilters.page, route]);
  const hasFilters = Boolean(currentFilters.query || currentFilters.origin || currentFilters.destination);
  const selectedOnPage = result.items.some(item => item.id === route?.id);
  const country = (port: RoutePort) => local(locale, port.country || port.countryTh, port.countryTh || port.country);
  const name = (port: RoutePort) => local(locale, port.name || port.nameTh, port.nameTh || port.name);
  const routeDescription = contentText(route, "description", locale);
  const number = new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-GB", { maximumFractionDigits: 2 });
  const positive = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  const range = (min: number | undefined, max: number | undefined) => positive(min) && positive(max) && min <= max
    ? min === max ? number.format(min) : `${number.format(min)}–${number.format(max)}`
    : undefined;
  const metrics = [
    { key: "distance", label: local(locale, "Route distance", "ระยะทาง"), value: positive(route?.routeSpecs?.distanceNm) ? number.format(route.routeSpecs.distanceNm) : undefined, unit: local(locale, "NM", "ไมล์ทะเล"), icon: Ruler },
    { key: "capacity", label: local(locale, "Container capacity", "ความจุตู้คอนเทนเนอร์"), value: range(route?.routeSpecs?.capacityMinTeu, route?.routeSpecs?.capacityMaxTeu), unit: "TEU", icon: Container },
    { key: "sailing", label: local(locale, "Sailing time", "เวลาเดินเรือ"), value: range(route?.routeSpecs?.sailingMinHours, route?.routeSpecs?.sailingMaxHours), unit: local(locale, "hrs", "ชม."), icon: Clock3 },
  ];
  const resetFilters = () => { updateFilters({ ...emptyRouteFilters }); searchRef.current?.focus(); };
  function showSelected() {
    if (!route) return;
    const index = filtered.findIndex(item => item.id === route.id);
    updateFilters(index >= 0
      ? { ...currentFilters, page: Math.floor(index / ROUTE_PAGE_SIZE) + 1 }
      : { ...emptyRouteFilters, page: Math.floor(routes.indexOf(route) / ROUTE_PAGE_SIZE) + 1 });
  }

  if (!route) return <div className={styles.empty}>
    <Compass size={35} aria-hidden="true" />
    <h2>{local(locale, "No mapped routes published yet", "ยังไม่มีเส้นทางที่มีข้อมูลแผนที่")}</h2>
    <p>{local(locale, "Published route details will appear here.", "รายละเอียดเส้นทางที่เผยแพร่จะแสดงที่นี่")}</p>
  </div>;

  return <div className={styles.layout} role="region" aria-label={local(locale, "Explore port connections", "สำรวจการเชื่อมต่อระหว่างท่าเรือ")}>
    <section className={styles.panel} aria-label={local(locale, "Find a route", "ค้นหาเส้นทาง")}>
      <div className={styles.finderHeading}><span className={styles.finderIcon}><Compass size={25} aria-hidden="true" /></span><div><h2>{local(locale, "Explore connections", "สำรวจเส้นทางเชื่อมต่อ")}</h2><p>{local(locale, "Choose a route to explore ports and voyage details.", "เลือกเส้นทางเพื่อดูท่าเรือและรายละเอียดการเดินทาง")}</p></div></div>
      <div className={styles.finderBody}>
      <div className={styles.search}>
        <Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>{local(locale, "Search routes", "ค้นหาเส้นทางเดินเรือ")}</label>
        <input ref={searchRef} id={searchId} type="search" value={currentFilters.query} maxLength={listingQueryLimit} placeholder={local(locale, "Port, country or route", "ท่าเรือ ประเทศ หรือเส้นทาง")} onChange={event => updateFilters({ ...currentFilters, query: event.target.value, page: 1 })} />
        {currentFilters.query && <button type="button" aria-label={local(locale, "Clear route search", "ล้างคำค้นหาเส้นทาง")} onClick={() => { updateFilters({ ...currentFilters, query: "", page: 1 }); searchRef.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}
      </div>
      <div className={styles.portFilters}>
        <div><label htmlFor={originId}>{local(locale, "Origin", "ต้นทาง")}</label><SelectionDialog id={originId} label={local(locale, "Origin", "ต้นทาง")} value={currentFilters.origin} onChange={value => updateFilters({ ...currentFilters, origin: value, page: 1 })} options={[{ value: "", label: local(locale, "All ports", "ทั้งหมด") }, ...origins]} closeLabel={local(locale, "Close dialog", "ปิดหน้าต่าง")} searchPlaceholder={local(locale, "Search ports", "ค้นหาท่าเรือ")} /></div>
        <div><label htmlFor={destinationId}>{local(locale, "Destination", "ปลายทาง")}</label><SelectionDialog id={destinationId} label={local(locale, "Destination", "ปลายทาง")} value={currentFilters.destination} onChange={value => updateFilters({ ...currentFilters, destination: value, page: 1 })} options={[{ value: "", label: local(locale, "All ports", "ทั้งหมด") }, ...destinations]} closeLabel={local(locale, "Close dialog", "ปิดหน้าต่าง")} searchPlaceholder={local(locale, "Search ports", "ค้นหาท่าเรือ")} /></div>
      </div>
      <div className={styles.resultBar}>
        <p role="status">{local(locale, result.total + (result.total === 1 ? " route" : " routes"), result.total + " เส้นทาง")}</p>
        {hasFilters && <button type="button" onClick={resetFilters}><RotateCcw size={15} aria-hidden="true" />{local(locale, "Reset", "ล้างตัวกรอง")}</button>}
      </div>
      {result.items.length ? <fieldset className={styles.options}>
        <legend className="sr-only">{local(locale, "Shipping route", "เส้นทางเดินเรือ")}</legend>
        {result.items.map(item => <label className={[styles.option, route.id === item.id ? styles.selected : ""].join(" ")} key={item.id}>
          <input type="radio" name={routeGroupId} value={item.id} checked={route.id === item.id} onChange={() => selectRoute(item.id)} onClick={() => { if (route.id === item.id) showMap(); }} aria-controls={detailsId} />
          <span><strong>{contentText(item, "title", locale)}</strong><span>{[country(item.origin), country(item.destination)].filter((value, index, all) => value && all.indexOf(value) === index).join(" · ")}</span></span>
          <CheckCircle2 size={20} aria-hidden="true" className={styles.check} />
        </label>)}
      </fieldset> : <div className={styles.noResults}><Search size={27} aria-hidden="true" /><h3>{local(locale, "No matching routes", "ไม่พบเส้นทางที่ตรงกัน")}</h3><p>{local(locale, "Try another port or clear the filters.", "ลองค้นหาท่าเรืออื่น หรือล้างตัวกรอง")}</p><button type="button" onClick={resetFilters}>{local(locale, "Clear filters", "ล้างตัวกรองทั้งหมด")}</button></div>}
      {result.total > 0 && <Pagination page={result.page} totalPages={result.pageCount} onPageChange={page => updateFilters({ ...currentFilters, page })} label={local(locale, "Route result pages", "หน้ารายการเส้นทาง")} previousLabel={local(locale, "Previous routes", "เส้นทางหน้าก่อนหน้า")} nextLabel={local(locale, "Next routes", "เส้นทางหน้าถัดไป")} />}
      {!selectedOnPage && <button className={styles.showSelected} type="button" onClick={showSelected}>{local(locale, "Show selected route in list", "แสดงเส้นทางที่เลือกในรายการ")}</button>}
      <button className={styles.mobileMapLink} type="button" onClick={showMap}><MapPin size={18} aria-hidden="true" />{local(locale, "View selected route on map", "ดูเส้นทางที่เลือกบนแผนที่")}</button>
      </div>
    </section>
    <div ref={mapColumnRef} className={styles.mapColumn}>
      <div className={styles.map}><InteractiveRouteMap locale={locale} selectedId={route.id} routes={mapRoutes} onSelect={selectRoute} deferUntilVisible={deferMap} /></div>
      <section id={detailsId} className={styles.details} aria-label={local(locale, "Selected route details", "รายละเอียดเส้นทางที่เลือก")}>
        <p className={styles.selectedLabel}><Ship size={17} aria-hidden="true" />{local(locale, "Selected route", "เส้นทางที่เลือก")}{route.category && <span className={styles.routeCategory}>{contentText(route, "category", locale) || route.category}</span>}</p>
        <h3>{contentText(route, "title", locale)}</h3>
        <dl className={styles.metrics} aria-label={local(locale, "Voyage details", "รายละเอียดการเดินทาง")}>{metrics.map(({ key, label, value, unit, icon: Icon }) => <div key={key}><dt><Icon size={18} aria-hidden="true" />{label}</dt><dd>{value !== undefined ? <>{value}<span className={styles.metricUnit}> {unit}</span></> : <><span className={styles.missing} aria-hidden="true">—</span><span className="sr-only">{local(locale, "Not provided", "ยังไม่มีข้อมูล")}</span></>}</dd></div>)}</dl>
        <dl className={styles.ports}>{([
          { key: "origin", label: local(locale, "Origin", "ต้นทาง"), port: route.origin, coordinates: route.waypoints[0] },
          { key: "destination", label: local(locale, "Destination", "ปลายทาง"), port: route.destination, coordinates: route.waypoints.at(-1)! },
        ]).map(({ key, label, port, coordinates }, index) => <div key={key}><dt><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{label}</dt><dd><strong>{name(port)}</strong><span>{country(port)}</span><a href={googleMapsPointUrl(...coordinates)} target="_blank" rel="noopener noreferrer" aria-label={local(locale, `Open ${label.toLowerCase()} port in Google Maps: ${name(port)} (opens in a new tab)`, `เปิดท่าเรือ${label}ใน Google Maps: ${name(port)} (เปิดในแท็บใหม่)`)}>Google Maps<ExternalLink size={15} aria-hidden="true" /></a></dd></div>)}</dl>
        <p className="sr-only" role="status">{local(locale, "Showing " + name(route.origin) + " to " + name(route.destination) + ".", "กำลังแสดงเส้นทางจาก" + name(route.origin) + "ไป" + name(route.destination))}</p>
        {routeDescription && <p className={styles.description}>{routeDescription}</p>}
        <ContentBody text={contentText(route, "body", locale)} />
        <p className={styles.note}>{local(locale, "Confirm routing, timing and availability with our team before planning a shipment.", "กรุณาสอบถามทีมงานเพื่อยืนยันเส้นทาง ช่วงเวลา และความพร้อมให้บริการก่อนวางแผนขนส่ง")}</p>
        <Link className="button" href={href(locale, "contact?subject=" + encodeURIComponent(contentText(route, "title", locale)))}>{local(locale, "Enquire about this route", "สอบถามเกี่ยวกับเส้นทางนี้")}<Ship aria-hidden="true" size={20} /></Link>
      </section>
    </div>
  </div>;
}

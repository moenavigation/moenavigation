"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Compass, MapPin, RotateCcw, Search, X } from "lucide-react";
import Link from "./NavigationLink";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord, RoutePort } from "@/lib/cms-types";
import { contentText } from "@/lib/public-content";
import { emptyRouteFilters, filterMappedRoutes, getRoutePage, routePortOptions, ROUTE_PAGE_SIZE, type MappedRoute, type RouteFilters } from "@/lib/route-explorer";
import { listingQueryLimit } from "@/lib/listing-filters";
import InteractiveRouteMap from "./InteractiveRouteMap";
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

  return <div className={styles.layout} role="region" aria-label={local(locale, "Explore shipping connections", "ดูเส้นทางเดินเรือ")}>
    <section className={styles.panel} aria-label={local(locale, "Find a route", "ค้นหาเส้นทาง")}>
      <div className={styles.finderHeading}><Compass size={25} aria-hidden="true" /><div><h2>{local(locale, "Find a route", "ค้นหาเส้นทาง")}</h2><p>{local(locale, "Search by port, country or route name.", "ค้นหาจากท่าเรือ ประเทศ หรือชื่อเส้นทาง")}</p></div></div>
      <div className={styles.search}>
        <Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>{local(locale, "Search routes", "ค้นหาเส้นทางเดินเรือ")}</label>
        <input ref={searchRef} id={searchId} type="search" value={currentFilters.query} maxLength={listingQueryLimit} placeholder={local(locale, "Port, country or route", "ท่าเรือ ประเทศ หรือเส้นทาง")} onChange={event => updateFilters({ ...currentFilters, query: event.target.value, page: 1 })} />
        {currentFilters.query && <button type="button" aria-label={local(locale, "Clear route search", "ล้างคำค้นหาเส้นทาง")} onClick={() => { updateFilters({ ...currentFilters, query: "", page: 1 }); searchRef.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}
      </div>
      <div className={styles.portFilters}>
        <label htmlFor={originId}>{local(locale, "Origin", "ต้นทาง")}<select id={originId} value={currentFilters.origin} onChange={event => updateFilters({ ...currentFilters, origin: event.target.value, page: 1 })}><option value="">{local(locale, "All ports", "ทั้งหมด")}</option>{origins.map(port => <option value={port.value} key={port.value}>{port.label}</option>)}</select></label>
        <label htmlFor={destinationId}>{local(locale, "Destination", "ปลายทาง")}<select id={destinationId} value={currentFilters.destination} onChange={event => updateFilters({ ...currentFilters, destination: event.target.value, page: 1 })}><option value="">{local(locale, "All ports", "ทั้งหมด")}</option>{destinations.map(port => <option value={port.value} key={port.value}>{port.label}</option>)}</select></label>
      </div>
      <div className={styles.resultBar}>
        <p role="status">{local(locale, result.total + (result.total === 1 ? " route" : " routes"), result.total + " เส้นทาง")}</p>
        {hasFilters && <button type="button" onClick={resetFilters}><RotateCcw size={15} aria-hidden="true" />{local(locale, "Reset", "ล้างตัวกรอง")}</button>}
      </div>
      {result.items.length ? <fieldset className={styles.options}>
        <legend className="sr-only">{local(locale, "Shipping route", "เส้นทางเดินเรือ")}</legend>
        {result.items.map(item => <label className={[styles.option, route.id === item.id ? styles.selected : ""].join(" ")} key={item.id}>
          <input type="radio" name={routeGroupId} value={item.id} checked={route.id === item.id} onChange={() => onSelect(item.id)} aria-controls={detailsId} />
          <span><strong>{contentText(item, "title", locale)}</strong><span>{country(item.origin)} <ChevronRight size={14} aria-hidden="true" /> {country(item.destination)}</span></span>
          <CheckCircle2 size={20} aria-hidden="true" className={styles.check} />
        </label>)}
      </fieldset> : <div className={styles.noResults}><Search size={27} aria-hidden="true" /><h3>{local(locale, "No matching routes", "ไม่พบเส้นทางที่ตรงกัน")}</h3><p>{local(locale, "Try another port or clear the filters.", "ลองค้นหาท่าเรืออื่น หรือล้างตัวกรอง")}</p><button type="button" onClick={resetFilters}>{local(locale, "Clear filters", "ล้างตัวกรองทั้งหมด")}</button></div>}
      {result.pageCount > 1 && <nav className={styles.pagination} aria-label={local(locale, "Route result pages", "หน้ารายการเส้นทาง")}>
        <button type="button" disabled={result.page === 1} aria-label={local(locale, "Previous routes", "เส้นทางหน้าก่อนหน้า")} onClick={() => updateFilters({ ...currentFilters, page: result.page - 1 })}><ChevronLeft size={20} aria-hidden="true" /></button>
        <span>{local(locale, result.start + "–" + result.end + " of " + result.total, result.start + "–" + result.end + " จาก " + result.total + " เส้นทาง")}</span>
        <button type="button" disabled={result.page === result.pageCount} aria-label={local(locale, "Next routes", "เส้นทางหน้าถัดไป")} onClick={() => updateFilters({ ...currentFilters, page: result.page + 1 })}><ChevronRight size={20} aria-hidden="true" /></button>
      </nav>}
      {!selectedOnPage && <button className={styles.showSelected} type="button" onClick={showSelected}>{local(locale, "Show selected route in list", "แสดงเส้นทางที่เลือกในรายการ")}<ChevronRight size={17} aria-hidden="true" /></button>}
      <button className={styles.mobileMapLink} type="button" onClick={() => mapColumnRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}><MapPin size={18} aria-hidden="true" />{local(locale, "View selected route on map", "ดูเส้นทางที่เลือกบนแผนที่")}</button>
    </section>
    <div ref={mapColumnRef} className={styles.mapColumn}>
      <div className={styles.map}><InteractiveRouteMap locale={locale} selectedId={route.id} routes={mapRoutes} onSelect={onSelect} deferUntilVisible={deferMap} /></div>
      <section id={detailsId} className={styles.details} aria-label={local(locale, "Selected route details", "รายละเอียดเส้นทางที่เลือก")}>
        <p className={styles.selectedLabel}>{local(locale, "Selected route", "เส้นทางที่เลือก")}</p>
        <h3>{contentText(route, "title", locale)}</h3>
        <dl><div><dt>{local(locale, "Origin", "ต้นทาง")}</dt><dd>{name(route.origin)}<span>{country(route.origin)}</span></dd></div><div><dt>{local(locale, "Destination", "ปลายทาง")}</dt><dd>{name(route.destination)}<span>{country(route.destination)}</span></dd></div></dl>
        <p className="sr-only" role="status">{local(locale, "Showing " + name(route.origin) + " to " + name(route.destination) + ".", "กำลังแสดงเส้นทางจาก" + name(route.origin) + "ไป" + name(route.destination))}</p>
        <p className={styles.description}>{contentText(route, "description", locale)}</p>
        <ContentBody text={contentText(route, "body", locale)} />
        <p className={styles.note}>{local(locale, "Illustrative connection. Confirm routing, schedules and availability with our team.", "เส้นทางนี้ใช้ประกอบการนำเสนอ กรุณาติดต่อทีมงานเพื่อยืนยันเส้นทาง ตารางเดินเรือ และความพร้อมให้บริการ")}</p>
        <Link className="button" href={href(locale, "contact?subject=" + encodeURIComponent(contentText(route, "title", locale)))}>{local(locale, "Enquire about this route", "สอบถามเกี่ยวกับเส้นทางนี้")}<ChevronRight aria-hidden="true" size={20} /></Link>
      </section>
    </div>
  </div>;
}

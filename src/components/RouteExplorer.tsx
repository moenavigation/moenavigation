"use client";

import { useId } from "react";
import { ArrowRight, CheckCircle2, Compass } from "lucide-react";
import Link from "./NavigationLink";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord, RoutePort } from "@/lib/cms-types";
import { contentText } from "@/lib/public-content";
import InteractiveRouteMap, { type MappedRoute } from "./InteractiveRouteMap";
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
  deferMap?: boolean;
};

export default function RouteExplorer({ locale, routes, selectedId, onSelect, deferMap = false }: Props) {
  const routeGroupId = useId();
  const detailsId = useId();
  const route = routes.find((item) => item.id === selectedId) || routes[0];
  const country = (port: RoutePort) => local(locale, port.country, port.countryTh);
  const name = (port: RoutePort) => local(locale, port.name, port.nameTh);

  if (!route) return <div className={styles.empty}>
    <Compass size={35} aria-hidden="true" />
    <h2>{local(locale, "No mapped routes published yet", "ยังไม่มีเส้นทางที่มีข้อมูลแผนที่")}</h2>
    <p>{local(locale, "Published route details will appear here.", "รายละเอียดเส้นทางที่เผยแพร่จะแสดงที่นี่")}</p>
  </div>;

  return <div className={styles.layout} role="region" aria-label={local(locale, "Explore shipping connections", "ดูเส้นทางเดินเรือ")}>
    <div className={styles.map}>
      <InteractiveRouteMap locale={locale} selectedId={route.id} routes={routes} onSelect={onSelect} deferUntilVisible={deferMap} />
    </div>
    <div className={styles.panel}>
      <h2>{local(locale, "Explore our routes", "เส้นทางเดินเรือของเรา")}</h2>
      <p>{local(locale, "Select a port-to-port connection.", "เลือกเส้นทางเชื่อมต่อระหว่างท่าเรือ")}</p>
      <fieldset className={styles.options}>
        <legend className="sr-only">{local(locale, "Shipping route", "เส้นทางเดินเรือ")}</legend>
        {routes.map((item) => <label className={`${styles.option} ${route.id === item.id ? styles.selected : ""}`} key={item.id}>
          <input type="radio" name={routeGroupId} value={item.id} checked={route.id === item.id} onChange={() => onSelect(item.id)} aria-controls={detailsId} />
          <span><strong>{contentText(item, "title", locale)}</strong><span>{country(item.origin)} <span aria-hidden="true">→</span> {country(item.destination)}</span></span>
          <CheckCircle2 size={21} aria-hidden="true" className={styles.check} />
        </label>)}
      </fieldset>
      <div id={detailsId} className={styles.details}>
        <h3>{local(locale, "Selected route", "เส้นทางที่เลือก")}</h3>
        <dl>
          <div><dt>{local(locale, "Origin", "ต้นทาง")}</dt><dd>{name(route.origin)}<span>{country(route.origin)}</span></dd></div>
          <div><dt>{local(locale, "Destination", "ปลายทาง")}</dt><dd>{name(route.destination)}<span>{country(route.destination)}</span></dd></div>
        </dl>
      </div>
      <p className="sr-only" role="status">{local(locale, `Showing ${name(route.origin)} to ${name(route.destination)}.`, `กำลังแสดงเส้นทางจาก${name(route.origin)}ไป${name(route.destination)}`)}</p>
      <p className={styles.description}>{contentText(route, "description", locale)}</p>
      <ContentBody text={contentText(route, "body", locale)} />
      <p className={styles.note}>{local(locale, "Illustrative connections. Confirm routing, schedules and availability when you enquire.", "เส้นทางนี้ใช้ประกอบการนำเสนอ กรุณาติดต่อทีมงานเพื่อยืนยันเส้นทาง ตารางเดินเรือ และความพร้อมให้บริการ")}</p>
      <Link className="button" href={href(locale, `contact?subject=${encodeURIComponent(contentText(route, "title", locale))}`)}>
        {local(locale, "Enquire about this route", "สอบถามเกี่ยวกับเส้นทางนี้")}<ArrowRight aria-hidden="true" size={20} />
      </Link>
    </div>
  </div>;
}

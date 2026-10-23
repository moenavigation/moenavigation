"use client";

import Image from "next/image";
import Link from "./NavigationLink";
import { useSearchParams } from "next/navigation";
import { useCallback, useId } from "react";
import { ArrowRight, CheckCircle2, Compass } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord, RoutePort } from "@/lib/cms-types";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import InteractiveRouteMap, { type MappedRoute } from "./InteractiveRouteMap";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import styles from "./ContentPages.module.css";
import routeStyles from "./RoutesPage.module.css";

function isMapped(route: ContentRecord): route is MappedRoute {
  return !!route.origin && !!route.destination && !!route.waypoints && route.waypoints.length >= 2;
}

export default function RoutesPage({ locale }: { locale: Locale }) {
  const { routes, pages } = usePublicContent();
  const page = pages.find((item) => item.id === "routes");
  const selected = useSearchParams().get("route") || "";
  const setSelected = useCallback((id: string) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("route") === id) return;
    url.searchParams.set("route", id);
    // Preserve this choice through reload, language switching and returning
    // from an enquiry without filling browser history with map interactions.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const routeGroupId = useId();
  const detailsId = useId();
  const available = routes.filter(isMapped);
  const additional = routes.filter((item) => !isMapped(item));
  const route = available.find((item) => item.id === selected) || available[0];
  const country = (port: RoutePort) => local(locale,port.country,port.countryTh);
  const name = (port: RoutePort) => local(locale,port.name,port.nameTh);
  const enquiry = (item: ContentRecord) => <Link className="button" href={href(locale,`contact?subject=${encodeURIComponent(contentText(item,"title",locale))}`)}>{local(locale,"Enquire about this route","สอบถามเกี่ยวกับเส้นทางนี้")}<ArrowRight aria-hidden="true" size={20} /></Link>;
  return <div className="container section">
    <div className={styles.heading}><div><p className="eyebrow">{contentText(page,"eyebrow",locale)}</p><h1>{contentText(page,"title",locale)}</h1><p className={styles.lead}>{contentText(page,"description",locale)}</p></div></div>
    {route ? <section className={routeStyles.layout} aria-label={local(locale,"Explore shipping connections","สำรวจเส้นทางเชื่อมต่อทางเรือ")}>
      <div className={routeStyles.map}><InteractiveRouteMap locale={locale} selectedId={route.id} routes={available} onSelect={setSelected} /></div>
      <div className={routeStyles.panel}>
        <h2>{local(locale,"Explore our routes","สำรวจเส้นทางของเรา")}</h2><p>{local(locale,"Select a port-to-port connection.","เลือกเส้นทางเชื่อมต่อระหว่างท่าเรือ")}</p>
        <fieldset className={routeStyles.options}><legend className="sr-only">{local(locale,"Shipping route","เส้นทางเดินเรือ")}</legend>{available.map((item) => <label className={`${routeStyles.option} ${route.id === item.id ? routeStyles.selected : ""}`} key={item.id}><input type="radio" name={routeGroupId} value={item.id} checked={route.id === item.id} onChange={() => setSelected(item.id)} aria-controls={detailsId} /><span><strong>{contentText(item,"title",locale)}</strong><span>{country(item.origin)} <span aria-hidden="true">→</span> {country(item.destination)}</span></span><CheckCircle2 size={21} aria-hidden="true" className={routeStyles.check} /></label>)}</fieldset>
        <div id={detailsId} className={routeStyles.details}><h3>{local(locale,"Selected route","เส้นทางที่เลือก")}</h3><dl><div><dt>{local(locale,"Origin","ต้นทาง")}</dt><dd>{name(route.origin)}<span>{country(route.origin)}</span></dd></div><div><dt>{local(locale,"Destination","ปลายทาง")}</dt><dd>{name(route.destination)}<span>{country(route.destination)}</span></dd></div></dl></div>
        <p className="sr-only" role="status">{local(locale,`Showing ${name(route.origin)} to ${name(route.destination)}.`,`กำลังแสดงเส้นทางจาก${name(route.origin)}ไป${name(route.destination)}`)}</p>
        <p className={routeStyles.description}>{contentText(route,"description",locale)}</p><ContentBody text={contentText(route,"body",locale)} />
        <p className={routeStyles.note}>{local(locale,"Illustrative connections. Confirm routing, schedules and availability when you enquire.","เส้นทางประกอบการนำเสนอ กรุณายืนยันเส้นทาง ตารางเดินเรือ และความพร้อมเมื่อสอบถาม")}</p>{enquiry(route)}
      </div>
    </section> : <div className={styles.empty}><Compass size={35} aria-hidden="true" /><h2>{local(locale,"No mapped routes published yet","ยังไม่มีเส้นทางพร้อมแผนที่ที่เผยแพร่")}</h2><p>{local(locale,"Published route details will appear here.","รายละเอียดเส้นทางที่เผยแพร่จะแสดงที่นี่")}</p></div>}
    {additional.length>0 && <section className={styles.additionalRoutes} aria-label={local(locale,"Additional route information","ข้อมูลเส้นทางเพิ่มเติม")}><h2>{local(locale,"More connections","การเชื่อมต่อเพิ่มเติม")}</h2><div className={styles.grid}>{additional.map((item) => <article className={styles.card} key={item.id}><div className={styles.cardImage}><Image src={item.image} alt={contentText(item,"imageAlt",locale) || contentText(item,"title",locale)} fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 33vw" /></div><div className={styles.newsBody}><h3>{contentText(item,"title",locale)}</h3><p>{contentText(item,"description",locale)}</p><ContentBody text={contentText(item,"body",locale)} />{enquiry(item)}</div></article>)}</div></section>}
    <ContentBody text={contentText(page,"body",locale)} /><AdditionalSections pageId="routes" locale={locale} />
  </div>;
}

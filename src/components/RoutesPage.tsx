"use client";

import Image from "next/image";
import Link from "./NavigationLink";
import { usePublicSearchParams } from "@/lib/use-public-search-params";
import { useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord } from "@/lib/cms-types";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import RouteExplorer, { isMappedRoute } from "./RouteExplorer";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import styles from "./ContentPages.module.css";

export default function RoutesPage({ locale }: { locale: Locale }) {
  const { routes, pages } = usePublicContent();
  const page = pages.find((item) => item.id === "routes");
  const selected = usePublicSearchParams().get("route") || "";
  const setSelected = useCallback((id: string) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("route") === id) return;
    url.searchParams.set("route", id);
    // Preserve this choice through reload, language switching and returning
    // from an enquiry without filling browser history with map interactions.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const available = routes.filter(isMappedRoute);
  const additional = routes.filter((item) => !isMappedRoute(item));
  const enquiry = (item: ContentRecord) => <Link className="button" href={href(locale,`contact?subject=${encodeURIComponent(contentText(item,"title",locale))}`)}>{local(locale,"Enquire about this route","สอบถามเกี่ยวกับเส้นทางนี้")}<ArrowRight aria-hidden="true" size={20} /></Link>;
  return <div className="container section">
    <div className={styles.heading}><div><p className="eyebrow">{contentText(page,"eyebrow",locale)}</p><h1>{contentText(page,"title",locale)}</h1><p className={styles.lead}>{contentText(page,"description",locale)}</p></div></div>
    <RouteExplorer locale={locale} routes={available} selectedId={selected} onSelect={setSelected} />
    {additional.length>0 && <section className={styles.additionalRoutes} aria-label={local(locale,"Additional route information","ข้อมูลเส้นทางเพิ่มเติม")}><h2>{local(locale,"More connections","เส้นทางอื่น ๆ")}</h2><div className={styles.grid}>{additional.map((item) => <article className={styles.card} key={item.id}><div className={styles.cardImage}><Image src={item.image} alt={contentText(item,"imageAlt",locale) || contentText(item,"title",locale)} fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 33vw" /></div><div className={styles.newsBody}><h3>{contentText(item,"title",locale)}</h3><p>{contentText(item,"description",locale)}</p><ContentBody text={contentText(item,"body",locale)} />{enquiry(item)}</div></article>)}</div></section>}
    <ContentBody text={contentText(page,"body",locale)} /><AdditionalSections pageId="routes" locale={locale} />
  </div>;
}

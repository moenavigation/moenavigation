"use client";
import Image, { getImageProps } from "next/image";
import { useState } from "react";
import Link from "./NavigationLink";
import { ArrowRight, ChevronRight, Ship, Fuel, Container, Anchor, ShieldCheck, Compass, MessagesSquare, LifeBuoy, MapPin } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord } from "@/lib/cms-types";
import { categoryName } from "@/lib/category-name";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import RouteExplorer, { isMappedRoute } from "./RouteExplorer";
import VesselPhotoPlaceholder from "./VesselPhotoPlaceholder";
import styles from "./Home.module.css";
const icons = { Ship, Fuel, Container, Anchor, ShieldCheck, Compass, MessagesSquare, LifeBuoy, MapPin };
const placed = ["home-expertise", "home-trust", "home-trust-safety", "home-trust-practical", "home-trust-partnerships", "home-fleet", "home-connections", "home-news", "home-cta"];

export default function Home({ locale }: { locale: Locale }) {
  const { services, vessels, pages, sections, routes } = usePublicContent();
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const home = pages.find((page) => page.id === "home");
  const section = (id: string) => sections.find((entry) => entry.id === id && entry.parentId === "home");
  const expertise = section("home-expertise"), trust = section("home-trust"), fleet = section("home-fleet"), connection = section("home-connections");
  const text = (record: ContentRecord | undefined, field: Parameters<typeof contentText>[1]) => contentText(record, field, locale);
  const copy = (record: ContentRecord) => <><span className="eyebrow">{text(record,"eyebrow")}</span><h2>{text(record,"title")}</h2>{text(record,"description") && <p>{text(record,"description")}</p>}<ContentBody text={text(record,"body")} /></>;
  if (!home) return null;
  const heroProps = { alt: text(home,"imageAlt") || text(home,"title"), width: 1672, height: 941, sizes: "100vw", loading: "eager" as const, fetchPriority: "high" as const };
  const desktopHero = getImageProps({ ...heroProps, src: home.image }).props;
  const mobileHero = getImageProps({ ...heroProps, src: home.mobileImage || home.image }).props;
  return <>
    <section className={styles.hero}>
      <picture className={styles.heroPhoto}><source media="(max-width: 700px)" srcSet={mobileHero.srcSet || mobileHero.src} sizes="100vw" /><img {...desktopHero} alt={heroProps.alt} /></picture>
      <div className={`container ${styles.heroInner}`}><div className={styles.heroCopy}><span className="eyebrow">{text(home,"eyebrow")}</span><h1>{text(home,"title")}</h1><p>{text(home,"description")}</p><div className={styles.heroActions}><Link href={href(locale,"services")} className="button">{local(locale,"Explore services","ดูบริการของเรา")}</Link><Link href={href(locale,"contact")} className="button secondary">{local(locale,"Contact our team","ติดต่อทีมงาน")}</Link></div><span className={styles.heroCaption}>{text(home,"caption")}</span></div></div>
    </section>
    {text(home,"body") && <section className={`container ${styles.homeBody}`}><ContentBody text={text(home,"body")} /></section>}
    {expertise && <section className={`container section ${styles.expertise}`}><div className={styles.sectionHeading}><div>{copy(expertise)}</div><Link className="text-link" href={href(locale,"services")}>{local(locale,"View all services","บริการทั้งหมด")}<ChevronRight /></Link></div><div className={styles.expertiseGrid}>{services.slice(0,4).map((service) => { const Icon=icons[service.icon as keyof typeof icons] || Ship; return <Link href={href(locale,`services/${service.id}`)} key={service.id} className={styles.expertiseCard}><Icon className={styles.serviceIcon} /><div><h3>{service.title[locale]}</h3><p>{service.description[locale]}</p></div></Link>; })}</div></section>}
    {trust && <section className={styles.trust}>{trust.image && <Image src={trust.image} alt="" fill sizes="100vw" />}<div className={`container ${styles.trustInner}`}><div>{copy(trust)}<Link href={href(locale,"about")} className="text-link">{local(locale,"Get to know us","รู้จักเราให้มากขึ้น")}<ArrowRight /></Link></div><div className={styles.trustValues}>{sections.filter((entry) => entry.parentId === "home" && ["home-trust-safety","home-trust-practical","home-trust-partnerships"].includes(entry.id)).map((value) => { const Icon=icons[value.icon as keyof typeof icons] || Compass; return <div key={value.id}><Icon /><span><h3>{text(value,"title")}</h3><p>{text(value,"description")}</p><ContentBody text={text(value,"body")} /></span></div>; })}</div></div></section>}
    {fleet && <section className="container section">
      <div className={styles.sectionHeading}><div>{copy(fleet)}</div></div>
      <div className={styles.mediaGrid}>{vessels.slice(0,3).map((vessel) => <Link className={styles.mediaCard} href={href(locale,`fleet/${vessel.id}`)} key={vessel.id}><div className={styles.cardImage}>{vessel.image ? <Image src={vessel.image} alt={vessel.imageAlt[locale] || local(locale,vessel.name,vessel.nameTh)} fill sizes="(max-width:700px) 90vw, 30vw" /> : <VesselPhotoPlaceholder locale={locale} />}</div><div className={styles.cardCopy}><div><span className="eyebrow">{categoryName(locale,vessel.type,vessel.typeTh)}</span><h3>{local(locale,vessel.name,vessel.nameTh)}</h3></div></div></Link>)}</div>
      <div className={styles.fleetAction}><Link href={href(locale,"fleet")} className="button">{local(locale,"View all vessels","ดูกองเรือทั้งหมด")}</Link></div>
    </section>}
    {connection && <section className={styles.connection}>
      <div className="container">
        <div className={styles.sectionHeading}>
          <div>{copy(connection)}</div>
          <Link className="text-link" href={href(locale, selectedRouteId ? `routes?route=${encodeURIComponent(selectedRouteId)}` : "routes")}>
            {local(locale,"Explore connections","สำรวจเส้นทางเชื่อมต่อ")}<ChevronRight aria-hidden="true" />
          </Link>
        </div>
        <RouteExplorer locale={locale} routes={routes.filter(isMappedRoute)} selectedId={selectedRouteId} onSelect={setSelectedRouteId} deferMap />
      </div>
    </section>}
    <div className="container"><AdditionalSections pageId="home" locale={locale} exclude={placed} /></div>
  </>;
}

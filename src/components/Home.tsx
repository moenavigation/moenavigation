"use client";
import Image from "next/image";
import { useState } from "react";
import Link from "./NavigationLink";
import { ArrowRight, Ship, Fuel, Container, Anchor, ShieldCheck, Compass, MessagesSquare, LifeBuoy, MapPin, UsersRound } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord } from "@/lib/cms-types";
import { categoryName } from "@/lib/category-name";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import RouteExplorer, { isMappedRoute } from "./RouteExplorer";
import VesselPhotoPlaceholder from "./VesselPhotoPlaceholder";
import HeroSlider from "./HeroSlider";
import { getHomeSlides, getHomeSlideInterval } from "@/lib/home-slides";
import { defaultHomeCharters } from "@/lib/homepage-chartering";
import { fleetPhotos } from "@/lib/fleet-photos";
import styles from "./Home.module.css";
const icons = { Ship, Fuel, Container, Anchor, ShieldCheck, Compass, MessagesSquare, LifeBuoy, MapPin };
const placed = ["home-expertise", "home-trust", "home-trust-safety", "home-trust-practical", "home-trust-partnerships", "home-fleet", "home-connections", "home-news", "home-cta"];
const charterPhotos = [
  { kind: 'container', category: 'Container', vessel: 'moe-line-5', action: 'View container vessels', actionTh: 'ดูเรือคอนเทนเนอร์' },
  { kind: 'crane', category: 'Crane', vessel: 'moe-line-4', action: 'View crane vessels', actionTh: 'ดูเรือเครน' },
  { kind: 'tanker', category: 'Tanker', vessel: 'dumai-moe', action: 'View tanker vessels', actionTh: 'ดูเรือแท็งเกอร์' },
] as const;

export default function Home({ locale }: { locale: Locale }) {
  const { vessels, pages, sections, routes } = usePublicContent();
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const home = pages.find((page) => page.id === "home");
  const section = (id: string) => sections.find((entry) => entry.id === id && entry.parentId === "home");
  const expertise = section("home-expertise"), trust = section("home-trust"), fleet = section("home-fleet"), connection = section("home-connections");
  const charters = expertise?.homeCharters ?? defaultHomeCharters;
  const management = charters.management;
  const text = (record: ContentRecord | undefined, field: Parameters<typeof contentText>[1]) => contentText(record, field, locale);
  const copy = (record: ContentRecord) => <><span className="eyebrow">{text(record,"eyebrow")}</span><h2>{text(record,"title")}</h2>{text(record,"description") && <p>{text(record,"description")}</p>}<ContentBody text={text(record,"body")} /></>;
  if (!home) return null;
  return <>
    <section className={styles.hero} aria-labelledby="home-heading">
      <HeroSlider slides={getHomeSlides(home)} intervalSeconds={getHomeSlideInterval(home)} locale={locale} />
      <div className={`container ${styles.heroIntro}`}>
        <span className={`eyebrow ${styles.heroEyebrow}`}>{text(home,"eyebrow")}</span>
        <h1 id="home-heading">{text(home,"title")}</h1>
        <p className={styles.heroDescription}>{text(home,"description")}</p>
        <div className={styles.heroActions}>
          <a href={expertise ? "#chartering-services" : href(locale,"services")} className="button">{local(locale,"Explore Our Services","ดูบริการของเรา")}</a>
          <Link href={href(locale,"contact")} className="button secondary">{local(locale,"Contact Us","ติดต่อเรา")}</Link>
        </div>
        {text(home,"caption") && <span className={styles.heroCaption}>{text(home,"caption")}</span>}
      </div>
    </section>
    {text(home,"body") && <section className={`container ${styles.homeBody}`}><ContentBody text={text(home,"body")} /></section>}
    {expertise && <section id="chartering-services" className={`container section ${styles.expertise}`}>
      <div className={styles.sectionHeading}><div>{copy(expertise)}</div></div>
      <div className={styles.expertiseGrid}>{charterPhotos.map(({ kind, category, vessel, action, actionTh }) => {
        const charter = charters[kind];
        const [photo] = fleetPhotos[vessel];
        return <article key={kind} className={styles.expertiseCard}>
          <div className={styles.charterPhoto}><Image src={photo.url} alt={local(locale, photo.alt, photo.altTh)} fill sizes="(max-width:700px) 92vw, 31vw" unoptimized /></div>
          <div className={styles.charterCopy}>
            <h3>{local(locale, charter.title, charter.titleTh)}</h3>
            <p>{local(locale, charter.description, charter.descriptionTh)}</p>
            <Link href={`${href(locale, "fleet")}?category=${category}`} className="text-link">{local(locale, action, actionTh)}</Link>
          </div>
        </article>;
      })}</div>
      <div className={styles.management}><UsersRound aria-hidden="true" /><div>
        <span className="eyebrow">{local(locale, "Included in every charter", "บริการที่รวมอยู่ในการเช่าเรือ")}</span>
        <h3>{local(locale, management.title, management.titleTh)}</h3>
        <p>{local(locale, management.description, management.descriptionTh)}</p>
      </div></div>
    </section>}
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
        </div>
        <RouteExplorer locale={locale} routes={routes.filter(isMappedRoute)} selectedId={selectedRouteId} onSelect={setSelectedRouteId} deferMap />
      </div>
    </section>}
    <div className="container"><AdditionalSections pageId="home" locale={locale} exclude={placed} /></div>
  </>;
}

"use client";
import Image, { getImageProps } from "next/image";
import Link from "./NavigationLink";
import { ArrowRight, Ship, Fuel, Container, Anchor, ShieldCheck, Compass, MessagesSquare, LifeBuoy, MapPin } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord } from "@/lib/cms-types";
import { categoryName } from "@/lib/category-name";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import styles from "./Home.module.css";
const icons = { Ship, Fuel, Container, Anchor, ShieldCheck, Compass, MessagesSquare, LifeBuoy, MapPin };
const placed = ["home-expertise", "home-trust", "home-trust-safety", "home-trust-practical", "home-trust-partnerships", "home-fleet", "home-connections", "home-news", "home-cta"];

export default function Home({ locale }: { locale: Locale }) {
  const { services, vessels, news, pages, sections, routes } = usePublicContent();
  const home = pages.find((page) => page.id === "home");
  const section = (id: string) => sections.find((entry) => entry.id === id && entry.parentId === "home");
  const expertise = section("home-expertise"), trust = section("home-trust"), fleet = section("home-fleet"), connection = section("home-connections"), updates = section("home-news"), cta = section("home-cta");
  const text = (record: ContentRecord | undefined, field: Parameters<typeof contentText>[1]) => contentText(record, field, locale);
  const copy = (record: ContentRecord) => <><span className="eyebrow">{text(record,"eyebrow")}</span><h2>{text(record,"title")}</h2>{text(record,"description") && <p>{text(record,"description")}</p>}<ContentBody text={text(record,"body")} /></>;
  const origins = [...new Set(routes.map((route) => route.origin && local(locale, route.origin.country, route.origin.countryTh)).filter(Boolean))];
  const destinations = [...new Set(routes.map((route) => route.destination && local(locale, route.destination.country, route.destination.countryTh)).filter(Boolean))];
  if (!home) return null;
  const heroProps = { alt: text(home,"imageAlt") || text(home,"title"), width: 1672, height: 941, sizes: "100vw", loading: "eager" as const, fetchPriority: "high" as const };
  const desktopHero = getImageProps({ ...heroProps, src: home.image }).props;
  const mobileHero = getImageProps({ ...heroProps, src: home.mobileImage || home.image }).props;
  return <>
    <section className={styles.hero}>
      <picture className={styles.heroPhoto}><source media="(max-width: 700px)" srcSet={mobileHero.srcSet || mobileHero.src} sizes="100vw" /><img {...desktopHero} alt={heroProps.alt} /></picture>
      <div className={`container ${styles.heroInner}`}><div className={styles.heroCopy}><span className="eyebrow">{text(home,"eyebrow")}</span><h1>{text(home,"title")}</h1><p>{text(home,"description")}</p><div className={styles.heroActions}><Link href={href(locale,"services")} className="button">{local(locale,"Explore services","ดูบริการของเรา")}<ArrowRight /></Link><Link href={href(locale,"contact")} className="button secondary">{local(locale,"Contact our team","ติดต่อทีมงาน")}<ArrowRight /></Link></div><span className={styles.heroCaption}>{text(home,"caption")}</span></div></div>
    </section>
    {text(home,"body") && <section className={`container ${styles.homeBody}`}><ContentBody text={text(home,"body")} /></section>}
    {expertise && <section className={`container section ${styles.expertise}`}><div className={styles.sectionHeading}><div>{copy(expertise)}</div><Link className="text-link" href={href(locale,"services")}>{local(locale,"View all services","บริการทั้งหมด")}<ArrowRight /></Link></div><div className={styles.expertiseGrid}>{services.slice(0,4).map((service,index) => { const Icon=icons[service.icon as keyof typeof icons] || Ship; return <Link href={href(locale,`services/${service.id}`)} key={service.id} className={styles.expertiseCard}><span className={styles.serviceNumber}>{String(index+1).padStart(2,"0")}</span><Icon className={styles.serviceIcon} /><div><h3>{service.title[locale]}</h3><p>{service.description[locale]}</p></div><ArrowRight className={styles.cardArrow} /></Link>; })}</div></section>}
    {trust && <section className={styles.trust}>{trust.image && <Image src={trust.image} alt="" fill sizes="100vw" />}<div className={`container ${styles.trustInner}`}><div>{copy(trust)}<Link href={href(locale,"about")} className="text-link">{local(locale,"Get to know us","รู้จักเราให้มากขึ้น")}<ArrowRight /></Link></div><div className={styles.trustValues}>{sections.filter((entry) => entry.parentId === "home" && ["home-trust-safety","home-trust-practical","home-trust-partnerships"].includes(entry.id)).map((value) => { const Icon=icons[value.icon as keyof typeof icons] || Compass; return <div key={value.id}><Icon /><span><h3>{text(value,"title")}</h3><p>{text(value,"description")}</p><ContentBody text={text(value,"body")} /></span></div>; })}</div></div></section>}
    {fleet && <section className="container section"><div className={styles.sectionHeading}><div>{copy(fleet)}</div><Link href={href(locale,"fleet")} className="text-link">{local(locale,"Explore our fleet","ดูกองเรือ")}<ArrowRight /></Link></div><div className={styles.mediaGrid}>{vessels.slice(0,3).map((vessel) => <Link className={styles.mediaCard} href={href(locale,`fleet/${vessel.id}`)} key={vessel.id}><div className={styles.cardImage}><Image src={vessel.image} alt={vessel.imageAlt[locale] || local(locale,vessel.name,vessel.nameTh)} fill sizes="(max-width:700px) 90vw, 30vw" /></div><div className={styles.cardCopy}><div><span className="eyebrow">{categoryName(locale,vessel.type,vessel.typeTh)}</span><h3>{local(locale,vessel.name,vessel.nameTh)}</h3></div><ArrowRight /></div></Link>)}</div><p className={styles.disclaimer}>{local(locale,"Demo vessel collection. Names, specifications and availability will be confirmed with company data.","ข้อมูลกองเรือนี้เป็นตัวอย่าง ชื่อเรือ ข้อมูลทางเทคนิค และความพร้อมให้บริการยังต้องได้รับการยืนยันจากบริษัท")}</p></section>}
    {connection && <section className={styles.connection}><div className={`container ${styles.connectionInner}`}><div className={styles.connectionPhoto}>{connection.image && <Image src={connection.image} alt={text(connection,"imageAlt") || text(connection,"title")} fill sizes="(max-width:700px) 90vw, 45vw" />}<span>{text(connection,"caption")}</span></div><div>{copy(connection)}{origins.length>0 && destinations.length>0 && <div className={styles.portList}><span>{origins.join(" · ")}</span><ArrowRight /><span>{destinations.join(" · ")}</span></div>}<Link href={href(locale,"routes")} className="button">{local(locale,"Explore shipping routes","ดูเส้นทางเดินเรือ")}<ArrowRight /></Link><p className={styles.disclaimer}>{local(locale,"Illustrative connections; confirm service with our team.","เส้นทางตัวอย่าง โปรดยืนยันการให้บริการกับทีมงาน")}</p></div></div></section>}
    {updates && <section className="container section"><div className={styles.sectionHeading}><div>{copy(updates)}</div><Link href={href(locale,"news")} className="text-link">{local(locale,"All updates","ข่าวสารทั้งหมด")}<ArrowRight /></Link></div><div className={styles.mediaGrid}>{news.slice(0,3).map((article) => <Link key={article.id} href={href(locale,`news/${article.id}`)} className={styles.newsCard}><div className={styles.cardImage}><Image src={article.image} alt={article.imageAlt[locale] || article.title[locale]} fill sizes="(max-width:700px) 90vw, 30vw" /></div><div className={styles.newsCopy}><span className="eyebrow">{categoryName(locale,article.category,article.categoryTh)}</span><h3>{article.title[locale]}</h3><span className="text-link">{local(locale,"Read story","อ่านเพิ่มเติม")}<ArrowRight /></span></div></Link>)}</div></section>}
    <div className="container"><AdditionalSections pageId="home" locale={locale} exclude={placed} /></div>
    {cta && <section className={styles.cta}><div className={`container ${styles.ctaInner}`}><div>{copy(cta)}</div><Link href={href(locale,"contact")} className="button">{local(locale,"Contact our team","ติดต่อทีมงาน")}<ArrowRight /></Link></div></section>}
  </>;
}

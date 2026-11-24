"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Compass, Mail, MapPin, Phone, ShieldCheck, Users, Wrench } from "lucide-react";
import type { ContentRecord } from "@/lib/cms-types";
import { href, local, type Locale } from "@/lib/content";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import Link from "./NavigationLink";
import CompanyPhotoArchive from "./CompanyPhotoArchive";
import styles from "./AboutPage.module.css";

const featureDefinitions = [
  { id: "about-safety", icon: ShieldCheck },
  { id: "about-maintenance", icon: Wrench },
  { id: "about-crew", icon: Users },
  { id: "about-office", icon: Compass },
] as const;

function SectionCopy({ record, locale, icon }: { record: ContentRecord; locale: Locale; icon: ReactNode }) {
  return <>
    {contentText(record, "eyebrow", locale) && <p className="eyebrow">{contentText(record, "eyebrow", locale)}</p>}
    <h2 className={styles.sectionHeading}>{icon}<span>{contentText(record, "title", locale)}</span></h2>
    {contentText(record, "description", locale) && <p className={styles.description}>{contentText(record, "description", locale)}</p>}
    <ContentBody text={contentText(record, "body", locale)} />
  </>;
}

export default function AboutPage({ locale }: { locale: Locale }) {
  const { pages, sections, settings } = usePublicContent();
  const page = pages.find(item => item.id === "about");
  const aboutSections = sections.filter(item => item.parentId === "about");
  const section = (id: string) => aboutSections.find(item => item.id === id);
  const intro = section("about-intro");
  const direction = [section("about-mission"), section("about-vision")].filter((item): item is ContentRecord => Boolean(item));
  const features = featureDefinitions.flatMap(definition => {
    const record = section(definition.id);
    return record ? [{ ...definition, record }] : [];
  });
  const profile = section("about-profile");
  const callout = sections.find(item => item.id === "shared-callout" && item.parentId === "shared");
  const companyName = settings.companyName;
  const officeAddress = local(locale, settings.officeAddress || settings.officeAddressTh, settings.officeAddressTh || settings.officeAddress);
  const hasContactDetails = officeAddress || settings.phone || settings.email || settings.mapUrl;
  const handledSections = ["about-intro", "about-mission", "about-vision", "about-profile", ...featureDefinitions.map(item => item.id)];
  if (!page) return null;
  const archivePhotos = page.gallery?.filter(photo => typeof photo?.url === 'string' && photo.url.trim());

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={`container ${styles.heroGrid} ${!page.image ? styles.heroWithoutImage : ""}`}>
        <div className={styles.heroCopy}>
          {contentText(page, "eyebrow", locale) && <p className="eyebrow">{contentText(page, "eyebrow", locale)}</p>}
          <h1 lang="en">{companyName}</h1>
          {contentText(page, "description", locale) && <p className={styles.heroDescription}>{contentText(page, "description", locale)}</p>}
          <div className={styles.heroActions}>
            <Link href={href(locale, "fleet")}>{local(locale, "Our fleet", "กองเรือของเรา")}</Link>
            <Link href={href(locale, "routes")}>{local(locale, "Trading routes", "เส้นทางการเดินเรือ")}</Link>
          </div>
        </div>
        {page.image && <div className={styles.heroPhoto}><Image src={page.image} alt={contentText(page, "imageAlt", locale)} fill loading="eager" fetchPriority="high" sizes="(max-width: 850px) 100vw, 50vw" /></div>}
      </div>
    </header>

    <div className="container">
      {intro && <section className={`${styles.story} ${!intro.image ? styles.withoutPhoto : ""}`} aria-labelledby="about-story-title">
        {intro.image && <div className={styles.storyPhoto}><Image src={intro.image} alt={contentText(intro, "imageAlt", locale)} fill sizes="(max-width: 850px) 100vw, 42vw" /></div>}
        <div className={styles.storyCopy}>
          {contentText(intro, "eyebrow", locale) && <p className="eyebrow">{contentText(intro, "eyebrow", locale)}</p>}
          <h2 id="about-story-title">{contentText(intro, "title", locale)}</h2>
          {contentText(intro, "description", locale) && <p className={styles.storyLead}>{contentText(intro, "description", locale)}</p>}
          <ContentBody text={contentText(intro, "body", locale)} />
          <Link className={styles.textLink} href={href(locale, "services")}>{local(locale, "Explore our services", "ดูบริการของเรา")}<ArrowRight size={20} aria-hidden="true" /></Link>
        </div>
      </section>}

      {direction.length > 0 && <section className={styles.direction} aria-label={local(locale, "Our mission and vision", "พันธกิจและวิสัยทัศน์ของเรา")}>
        {direction.map(record => <article className={styles.directionCard} key={record.id}>
          <SectionCopy record={record} locale={locale} icon={record.id === "about-mission" ? <ShieldCheck aria-hidden="true" /> : <Compass aria-hidden="true" />} />
        </article>)}
      </section>}

      {features.length > 0 && <section className={styles.features} aria-label={local(locale, "Our people and operations", "บุคลากรและการปฏิบัติงานของเรา")}>
        {features.map(({ record, icon: Icon }) => <article id={record.id} className={`${styles.feature} ${!record.image ? styles.withoutPhoto : ""}`} key={record.id}>
          {record.image && <div className={styles.featurePhoto}><Image src={record.image} alt={contentText(record, "imageAlt", locale)} fill sizes="(max-width: 850px) 100vw, 48vw" /></div>}
          <div className={styles.featureCopy}>
            <SectionCopy record={record} locale={locale} icon={<Icon aria-hidden="true" />} />
          </div>
        </article>)}
      </section>}

      {contentText(page, "body", locale) && <div className={styles.pageBody}><ContentBody text={contentText(page, "body", locale)} /></div>}
      <AdditionalSections pageId="about" locale={locale} exclude={handledSections} />
      {archivePhotos?.length ? <CompanyPhotoArchive photos={archivePhotos} locale={locale} /> : null}

      {(profile || hasContactDetails || callout) && <section className={`${styles.company} ${!callout ? styles.withoutPhoto : ""}`} aria-label={local(locale, "Company details and contact", "ข้อมูลบริษัทและการติดต่อ")}>
        <div className={styles.companyDetails}>
          <p className="eyebrow">{local(locale, "Company details", "ข้อมูลบริษัท")}</p>
          <h2>{companyName}</h2>
          {profile && <div className={styles.profile}>
            {contentText(profile, "title", locale) && <h3>{contentText(profile, "title", locale)}</h3>}
            {contentText(profile, "description", locale) && <p>{contentText(profile, "description", locale)}</p>}
            <ContentBody text={contentText(profile, "body", locale)} />
          </div>}
          {hasContactDetails && <dl className={styles.contacts}>
            {officeAddress && <div><dt><MapPin size={20} aria-hidden="true" />{local(locale, "Head office", "สำนักงานใหญ่")}</dt><dd>{officeAddress}</dd></div>}
            {settings.phone && <div><dt><Phone size={20} aria-hidden="true" />{local(locale, "Phone", "โทรศัพท์")}</dt><dd><a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>{settings.phone}</a></dd></div>}
            {settings.email && <div><dt><Mail size={20} aria-hidden="true" />{local(locale, "Email", "อีเมล")}</dt><dd><a href={`mailto:${settings.email}`}>{settings.email}</a></dd></div>}
          </dl>}
          {settings.mapUrl && <a className={styles.textLink} href={settings.mapUrl} target="_blank" rel="noopener noreferrer">{local(locale, "Open office map", "เปิดแผนที่สำนักงาน")}<ArrowUpRight size={20} aria-hidden="true" /><span className="sr-only">{local(locale, "(opens in a new tab)", "(เปิดในแท็บใหม่)")}</span></a>}
        </div>
        {callout && <div className={styles.contactCard}>
          {contentText(callout, "eyebrow", locale) && <p className="eyebrow">{contentText(callout, "eyebrow", locale)}</p>}
          <h2>{contentText(callout, "title", locale)}</h2>
          {contentText(callout, "description", locale) && <p>{contentText(callout, "description", locale)}</p>}
          <ContentBody text={contentText(callout, "body", locale)} />
          <Link className="button" href={href(locale, "contact")}>{local(locale, "Contact our team", "ติดต่อทีมงาน")}<ArrowRight size={20} aria-hidden="true" /></Link>
        </div>}
      </section>}
    </div>
  </div>;
}

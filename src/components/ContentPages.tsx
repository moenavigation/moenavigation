"use client";

import Image from "next/image";
import Link from "./NavigationLink";
import { usePublicSearchParams } from "@/lib/use-public-search-params";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Anchor, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Compass, Container, Fuel, LifeBuoy, MapPin, Maximize2, RotateCcw, Search, ShieldCheck, Ship, X } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import type { ContentImage } from "@/lib/cms-types";
import { categoryName } from "@/lib/category-name";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import { listingHref, listingQueryLimit, matchesListingSearch, readListingFilters } from "@/lib/listing-filters";
import { useListingFilters } from "@/lib/use-listing-filters";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import Dialog from "./Dialog";
import RoutesPage from "./RoutesPage";
import ContactPage from "./ContactPage";
import PrivacyPage from "./PrivacyPage";
import VesselPhotoPlaceholder from "./VesselPhotoPlaceholder";
import styles from "./ContentPages.module.css";

type PageProps = { locale: Locale; page: string; slug?: string };
type Article = { id: string; title: { en: string; th: string }; description: { en: string; th: string }; body: { en: string; th: string }; bodyHeading: { en: string; th: string }; imageAlt: { en: string; th: string }; image: string; category: string; categoryTh?: string; date?: string };
const serviceIcons = { Ship, Fuel, Container, Compass, Anchor, LifeBuoy, ShieldCheck, MapPin };

function Action({ locale, to = "contact", children, secondary = false }: { locale: Locale; to?: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`button ${secondary ? "secondary" : ""}`} href={href(locale, to)}>{children}<ArrowRight aria-hidden="true" size={20} /></Link>;
}

function Heading({ eyebrow, title, description, action, hideTitle = false }: { eyebrow: string; title: string; description: string; action?: ReactNode; hideTitle?: boolean }) {
  return <div className={styles.heading}><div><p className="eyebrow">{eyebrow}</p><h1 className={hideTitle ? "sr-only" : undefined}>{title}</h1><p className={styles.lead}>{description}</p></div>{action}</div>;
}

function CategoryName({ locale, category, categoryTh }: { locale: Locale; category: string; categoryTh?: string }) {
  return <>{categoryName(locale, category, categoryTh)}</>;
}

function Callout({ locale }: { locale: Locale }) {
  const { sections } = usePublicContent();
  const section = sections.find((entry) => entry.id === "shared-callout" && entry.parentId === "shared");
  if (!section) return null;
  return <section className={styles.callout}>{section.image && <Image src={section.image} alt="" fill sizes="100vw" />}<div className={styles.calloutContent}><p className="eyebrow">{contentText(section,"eyebrow",locale)}</p><h2>{contentText(section,"title",locale)}</h2><p>{contentText(section,"description",locale)}</p><ContentBody text={contentText(section,"body",locale)} /><Action locale={locale}>{local(locale, "Contact our team", "ติดต่อทีมงาน")}</Action></div></section>;
}

function About({ locale }: { locale: Locale }) {
  const { pages, sections } = usePublicContent();
  const page = pages.find((item) => item.id === "about");
  const intro = sections.find((section) => section.id === "about-intro" && section.parentId === "about");
  const valueIds = ["about-vision", "about-mission", "about-values"];
  const values = sections.filter((section) => section.parentId === "about" && valueIds.includes(section.id));
  if (!page) return null;
  return <><section className={styles.aboutHero}><Image src={page.image} alt={contentText(page,"imageAlt",locale) || contentText(page,"title",locale)} fill loading="eager" fetchPriority="high" sizes="100vw" /><div className={`container ${styles.heroCopy}`}><p className="eyebrow">{contentText(page,"eyebrow",locale)}</p><h1>{contentText(page,"title",locale)}</h1><p>{contentText(page,"description",locale)}</p></div></section><div className="container section">
    {intro && <section className={styles.aboutIntro}><div className={styles.aboutPhoto}>{intro.image && <Image src={intro.image} alt={contentText(intro,"imageAlt",locale) || contentText(intro,"title",locale)} fill loading="eager" sizes="(max-width: 760px) 100vw, 50vw" />}</div><div className={styles.aboutCopy}><p className="eyebrow">{contentText(intro,"eyebrow",locale)}</p><h2>{contentText(intro,"title",locale)}</h2><p>{contentText(intro,"description",locale)}</p><ContentBody text={contentText(intro,"body",locale)} /><Link className={styles.textLink} href={href(locale,"services")}>{local(locale,"Explore our services","ดูบริการของเรา")}<ArrowRight size={20} aria-hidden="true" /></Link></div></section>}
    {values.length>0 && <section className={styles.values} aria-label={local(locale,"Vision, mission and values","วิสัยทัศน์ พันธกิจ และค่านิยม")}>{values.map((value) => { const Icon=serviceIcons[value.icon as keyof typeof serviceIcons] || Compass; return <article key={value.id}><span className={styles.valueIcon}><Icon aria-hidden="true" /></span><div><h3>{contentText(value,"title",locale)}</h3><p>{contentText(value,"description",locale)}</p><ContentBody text={contentText(value,"body",locale)} /></div></article>; })}</section>}
    <ContentBody text={contentText(page,"body",locale)} /><AdditionalSections pageId="about" locale={locale} exclude={["about-intro",...valueIds]} /><Callout locale={locale} /></div></>;
}

function Services({ locale, slug }: { locale: Locale; slug?: string }) {
  const { services, pages, sections } = usePublicContent();
  const page = pages.find((item) => item.id === "services");
  const planning = sections.find((item) => item.id === "service-planning" && item.parentId === "services");
  if (slug) {
    const service = services.find((item) => item.id === slug);
    if (!service) return <MissingEntry locale={locale} page="services" />;
    const Icon = serviceIcons[service.icon as keyof typeof serviceIcons] || Ship;
    const related = services.filter((item) => item.id !== service.id).slice(0, 3);
    return <div className="container section">
      <BackLink locale={locale} page="services" />
      <header className={styles.detailMasthead}>
        <p className="eyebrow">{local(locale, "SERVICE OVERVIEW", "ภาพรวมบริการ")}</p>
        <h1>{service.title[locale]}</h1>
        <p className={styles.lead}>{service.description[locale]}</p>
      </header>
      <section className={styles.serviceDetail} aria-label={local(locale, "Discuss this service", "พูดคุยเกี่ยวกับบริการนี้")}>
        <div className={styles.detailPhoto}><Image src={service.image} alt={service.imageAlt[locale] || service.title[locale]} fill priority sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className={styles.serviceDetailCopy}>
          <span className={styles.detailIcon}><Icon size={34} aria-hidden="true" /></span>
          {planning && <><p className="eyebrow">{contentText(planning,"eyebrow",locale)}</p><h2>{contentText(planning,"title",locale)}</h2><p>{contentText(planning,"description",locale)}</p><ContentBody text={contentText(planning,"body",locale)} /></>}
          <ul className={styles.enquiryList}>
            <li><span>01</span>{local(locale, "Operational requirements", "รายละเอียดงานที่ต้องการ")}</li>
            <li><span>02</span>{local(locale, "Port or operating area", "ท่าเรือหรือพื้นที่ดำเนินงาน")}</li>
            <li><span>03</span>{local(locale, "Preferred timing", "ช่วงเวลาที่ต้องการ")}</li>
          </ul>
          <Action locale={locale} to={`contact?subject=${encodeURIComponent(service.title[locale])}`}>{local(locale, "Discuss this service", "สอบถามบริการนี้")}</Action>
        </div>
      </section>
      {service.body[locale] && <section className={styles.serviceBody}>
        {service.bodyHeading[locale] && <h2>{service.bodyHeading[locale]}</h2>}
        <ContentBody text={service.body[locale]} />
      </section>}
      {related.length > 0 && <section className={styles.relatedSection} aria-label={local(locale, "Other services", "บริการอื่น ๆ")}>
        <div className={styles.relatedHeading}><p className="eyebrow">{local(locale, "EXPLORE MORE", "ดูเพิ่มเติม")}</p><h2>{local(locale, "Other services", "บริการอื่น ๆ")}</h2></div>
        <div className={styles.relatedLinks}>{related.map((item) => <Link key={item.id} href={href(locale, `services/${item.id}`)}><span>{item.title[locale]}</span><ArrowRight aria-hidden="true" size={19} /></Link>)}</div>
      </section>}
    </div>;
  }
  const [featured, ...more] = services;
  return <div className="container section">
    <Heading eyebrow={contentText(page,"eyebrow",locale)} title={contentText(page,"title",locale)} description={contentText(page,"description",locale)} />
    {featured ? <>
      <Link className={styles.serviceFeature} href={href(locale, `services/${featured.id}`)}>
        <div className={styles.serviceFeaturePhoto}><Image src={featured.image} alt={featured.imageAlt[locale] || featured.title[locale]} fill priority sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className={styles.serviceFeatureCopy}><h2>{featured.title[locale]}</h2><p>{featured.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Explore service", "ดูรายละเอียดบริการ")}<ChevronRight aria-hidden="true" size={19} /></span></div>
      </Link>
      {more.length > 0 && <div className={styles.capabilityGrid}>{more.map((item) => { const Icon = serviceIcons[item.icon as keyof typeof serviceIcons] || Ship; return <Link className={styles.capabilityCard} key={item.id} href={href(locale, `services/${item.id}`)}><div className={styles.capabilityImage}><Image src={item.image} alt={item.imageAlt[locale] || item.title[locale]} fill sizes="(max-width: 650px) 100vw, (max-width: 850px) 25vw, 15vw" /></div><div className={styles.capabilityCopy}><div className={styles.capabilityHeading}><Icon size={24} aria-hidden="true" /><h2>{item.title[locale]}</h2></div><p>{item.description[locale]}</p><span className={styles.cardAction}>{local(locale, "View service", "ดูบริการ")}<ChevronRight aria-hidden="true" size={18} /></span></div></Link>; })}</div>}
    </> : <div className={styles.empty}><Ship size={35} aria-hidden="true" /><h2>{local(locale, "No services published yet", "ยังไม่มีบริการที่เผยแพร่")}</h2><p>{local(locale, "Published services will appear here.", "บริการที่เผยแพร่จะแสดงที่นี่")}</p></div>}
    <ContentBody text={contentText(page,"body",locale)} /><AdditionalSections pageId="services" locale={locale} exclude={["service-planning"]} />
  </div>;
}

const subscribeToHydration = () => () => {};
const interactiveSnapshot = () => true;
const prerenderedSnapshot = () => false;

function Filters({ locale, categories, categoryTranslations, selected, onSelect, query, onQuery, placeholder, searchRef }: { locale: Locale; categories: string[]; categoryTranslations?: Record<string, string | undefined>; selected: string; onSelect: (value: string) => void; query: string; onQuery: (value: string) => void; placeholder: string; searchRef: RefObject<HTMLInputElement | null> }) {
  const searchId = useId();
  // Keep the static listing visible without accepting input before its handlers attach.
  const interactive = useSyncExternalStore(subscribeToHydration, interactiveSnapshot, prerenderedSnapshot);
  return <div className={styles.filters}>
    <div className={styles.filterButtons} role="group" aria-label={local(locale, "Filter by category", "กรองตามประเภท")}>{categories.map((category) => <button type="button" key={category} disabled={!interactive} aria-pressed={selected === category} className={selected === category ? styles.activeFilter : ""} onClick={() => onSelect(category)}><CategoryName locale={locale} category={category} categoryTh={categoryTranslations?.[category]} /></button>)}</div>
    <div className={styles.search}><Search size={21} aria-hidden="true" /><label className="sr-only" htmlFor={searchId}>{placeholder}</label><input ref={searchRef} id={searchId} type="search" disabled={!interactive} maxLength={listingQueryLimit} value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} />{query && <button className={styles.clearSearch} type="button" disabled={!interactive} aria-label={local(locale,"Clear search","ล้างคำค้นหา")} onClick={() => { onQuery(""); searchRef.current?.focus(); }}><X size={18} aria-hidden="true" /></button>}</div>
  </div>;
}

function ResultsSummary({ locale, children, active, reset }: { locale: Locale; children: ReactNode; active: boolean; reset: () => void }) {
  return <div className={styles.resultsSummary}><p className={styles.resultCount} role="status">{children}</p>{active && <button type="button" className={styles.resetFilters} onClick={reset}><RotateCcw size={16} aria-hidden="true" />{local(locale,"Reset filters","ล้างตัวกรอง")}</button>}</div>;
}

function Empty({ locale, reset }: { locale: Locale; reset: () => void }) {
  return <div className={styles.empty}><Search size={32} aria-hidden="true" /><h2>{local(locale, "No matching results", "ไม่พบผลลัพธ์ที่ตรงกัน")}</h2><p>{local(locale, "Try a different keyword or choose another category.", "ลองค้นหาด้วยคำอื่น หรือเลือกประเภทอื่น")}</p><button className="button secondary" type="button" onClick={reset}>{local(locale, "Clear filters", "ล้างตัวกรอง")}<RotateCcw size={18} aria-hidden="true" /></button></div>;
}

function Fleet({ locale, slug }: { locale: Locale; slug?: string }) {
  const { vessels, pages } = usePublicContent();
  const page = pages.find((item) => item.id === "fleet");
  const categories = ["All", ...new Set(vessels.map((item) => item.type))];
  const { category, query, setCategory, setQuery, reset } = useListingFilters(categories);
  const searchRef = useRef<HTMLInputElement>(null);
  function resetFilters() {
    reset();
    searchRef.current?.focus();
  }
  if (slug) return <VesselDetail locale={locale} slug={slug} />;
  const categoryTranslations = Object.fromEntries(categories.map((type) => [type, vessels.find((item) => item.type === type && item.typeTh)?.typeTh]));
  const filtered = vessels.filter((item) => (category === "All" || category === item.type) && matchesListingSearch(query, [item.name, item.nameTh, item.type, categoryName("th", item.type, item.typeTh), item.description.en, item.description.th]));
  return <div className="container section">
    <Heading eyebrow={contentText(page,"eyebrow",locale)} title={contentText(page,"title",locale)} description={contentText(page,"description",locale)} action={<Action locale={locale} to={`contact?subject=${encodeURIComponent(local(locale,"Vessel enquiry","สอบถามข้อมูลเรือ"))}`} secondary>{local(locale,"Discuss vessel needs","แจ้งความต้องการใช้เรือ")}</Action>} />
    <Filters locale={locale} categories={categories} categoryTranslations={categoryTranslations} selected={category} onSelect={setCategory} query={query} onQuery={setQuery} searchRef={searchRef} placeholder={local(locale, "Search vessels", "ค้นหาเรือ")} />
    <ResultsSummary locale={locale} active={category !== "All" || Boolean(query)} reset={resetFilters}>{local(locale, `${filtered.length} ${filtered.length === 1 ? "vessel" : "vessels"}`, `${filtered.length} ลำ`)}</ResultsSummary>
    {filtered.length ? <div className={styles.fleetGrid}>{filtered.map((item, index) => <Link href={listingHref(href(locale, `fleet/${item.id}`), { query, category })} key={item.id} className={styles.fleetCard}>
      <div className={styles.fleetImage}>{item.image ? <Image src={item.image} alt={item.imageAlt[locale] || local(locale, item.name, item.nameTh)} fill loading={index < 3 ? "eager" : "lazy"} sizes="(max-width: 650px) 100vw, (max-width: 1100px) 50vw, 33vw" /> : <VesselPhotoPlaceholder locale={locale} />}</div>
      <span className={styles.fleetCardInfo}><span className={styles.fleetIdentity}><span className={styles.fleetType}><CategoryName locale={locale} category={item.type} categoryTh={item.typeTh} /></span><strong>{local(locale, item.name, item.nameTh)}</strong></span><span className={styles.fleetAction}>{local(locale, "View vessel", "ดูข้อมูลเรือ")}<ChevronRight aria-hidden="true" size={19} /></span></span>
    </Link>)}</div> : <Empty locale={locale} reset={resetFilters} />}
    <ContentBody text={contentText(page,"body",locale)} /><AdditionalSections pageId="fleet" locale={locale} exclude={["vessel-planning"]} />
  </div>;
}

function BackLink({ locale, page }: { locale: Locale; page: string }) {
  const filters = readListingFilters(usePublicSearchParams());
  const names: Record<string, [string, string]> = { fleet: ["Back to fleet", "กลับไปยังกองเรือ"], services: ["Back to services", "กลับไปยังบริการ"], projects: ["Back to topics", "กลับไปยังหัวข้อทั้งหมด"], news: ["Back to articles", "กลับไปยังบทความ"] };
  return <Link className={styles.back} href={listingHref(href(locale, page), filters)}><ArrowLeft size={20} aria-hidden="true" />{local(locale, ...(names[page] || ["Back", "กลับ"] as [string, string]))}</Link>;
}

function Gallery({ locale, images, title }: { locale: Locale; images: ContentImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeIndex = Math.min(index, Math.max(0, images.length - 1));
  const change = (amount: number) => setIndex((current) => (Math.min(current, images.length - 1) + amount + images.length) % images.length);
  useEffect(() => {
    if (!open || images.length < 2) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((current) => (Math.min(current, images.length - 1) - 1 + images.length) % images.length); } if (event.key === "ArrowRight") { event.preventDefault(); setIndex((current) => (Math.min(current, images.length - 1) + 1) % images.length); } };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, images.length]);
  if (!images.length) return <div className={styles.gallery}><div className={styles.galleryMain}><VesselPhotoPlaceholder locale={locale} /></div></div>;
  const controls = images.length > 1 ? <><button className={`${styles.galleryControl} ${styles.prev}`} type="button" onClick={() => change(-1)} aria-label={local(locale, "Previous image", "ภาพก่อนหน้า")}><ChevronLeft aria-hidden="true" /></button><button className={`${styles.galleryControl} ${styles.next}`} type="button" onClick={() => change(1)} aria-label={local(locale, "Next image", "ภาพถัดไป")}><ChevronRight aria-hidden="true" /></button><span className={styles.counter} aria-live="polite">{activeIndex + 1} / {images.length}</span></> : null;
  return <div className={styles.gallery}><div className={styles.galleryMain}><Image src={images[activeIndex].url} alt={local(locale, images[activeIndex].alt, images[activeIndex].altTh) || title} fill loading="eager" fetchPriority="high" sizes="(max-width: 850px) 100vw, 65vw" /><button ref={triggerRef} className={`${styles.galleryControl} ${styles.expand}`} type="button" onClick={() => setOpen(true)} aria-label={local(locale, "Open image gallery", "เปิดแกลเลอรีภาพ")}><Maximize2 size={21} aria-hidden="true" /></button>{controls}</div>{images.length > 1 && <div className={styles.thumbnails}>{images.map((src, thumbnail) => <button type="button" key={`${src.url}-${thumbnail}`} aria-label={local(locale, `Show image ${thumbnail + 1}`, `แสดงภาพที่ ${thumbnail + 1}`)} aria-pressed={activeIndex === thumbnail} onClick={() => setIndex(thumbnail)}><Image src={src.url} alt="" fill sizes="(max-width: 850px) 25vw, 16vw" /></button>)}</div>}<Dialog open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} title={title} closeLabel={local(locale, "Close gallery", "ปิดแกลเลอรี")}><div className={styles.lightbox}>{open && <Image src={images[activeIndex].url} alt={local(locale, images[activeIndex].alt, images[activeIndex].altTh) || title} fill loading="eager" sizes="95vw" />}{controls}</div><p className={styles.lightboxCaption}>{images.length > 1 ? local(locale, "Use the arrows or arrow keys to explore. Press Escape to close.", "เลื่อนดูด้วยปุ่มลูกศรหรือแป้นลูกศร กด Escape เพื่อปิด") : local(locale, "Press Escape to close.", "กด Escape เพื่อปิด")}</p></Dialog></div>;
}

function VesselDetail({ locale, slug }: { locale: Locale; slug: string }) {
  const { vessels, sections } = usePublicContent();
  const vessel = vessels.find((item) => item.id === slug);
  const planning = sections.find((item) => item.id === "vessel-planning" && item.parentId === "fleet");
  if (!vessel) return <MissingEntry locale={locale} page="fleet" />;
  const images = [{url:vessel.image,alt:vessel.imageAlt.en || vessel.name,altTh:vessel.imageAlt.th || vessel.nameTh},...vessel.gallery].filter((image,index,all) => image.url.trim() && all.findIndex((item) => item.url === image.url) === index);
  const vesselName = local(locale, vessel.name, vessel.nameTh);
  const specs = vessel.specs;
  const number = (value: number) => new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-GB", { maximumFractionDigits: 2 }).format(value);
  const specificationRows: [string, string][] = [];
  if (specs?.imo) specificationRows.push([local(locale, "IMO number", "หมายเลข IMO"), specs.imo]);
  if (specs?.yearBuilt) specificationRows.push([local(locale, "Year built (CE)", "ปีที่สร้าง (ค.ศ.)"), String(specs.yearBuilt)]);
  if (specs?.lengthM) specificationRows.push([local(locale, "Length", "ความยาว"), `${number(specs.lengthM)} ${local(locale, "m", "ม.")}`]);
  if (specs?.beamM) specificationRows.push([local(locale, "Beam", "ความกว้าง"), `${number(specs.beamM)} ${local(locale, "m", "ม.")}`]);
  if (specs?.draftM) specificationRows.push([local(locale, "Draft", "ระยะกินน้ำลึก"), `${number(specs.draftM)} ${local(locale, "m", "ม.")}`]);
  if (specs?.deadweightT) specificationRows.push([local(locale, "Deadweight", "ระวางบรรทุก"), `${number(specs.deadweightT)} ${local(locale, "tonnes", "ตัน")}`]);
  if (specs?.capacityTeu !== undefined) specificationRows.push([local(locale, "Container capacity", "ความจุตู้คอนเทนเนอร์"), `${number(specs.capacityTeu)} TEU`]);
  if (specs?.flag || specs?.flagTh) specificationRows.push([local(locale, "Flag", "ประเทศที่จดทะเบียนเรือ"), local(locale, specs.flag || specs.flagTh || "", specs.flagTh || specs.flag || "")]);
  const availability = specs && local(locale, specs.availability || specs.availabilityTh || "", specs.availabilityTh || specs.availability || "");
  return <div className="container section">
    <BackLink locale={locale} page="fleet" />
    <section className={styles.vesselDetail}>
      <header className={styles.vesselTitle}><p className="eyebrow">{local(locale, "VESSEL PROFILE", "ข้อมูลเรือ")}</p><h1>{vesselName}</h1><p className={styles.lead}><CategoryName locale={locale} category={vessel.type} categoryTh={vessel.typeTh} /></p></header>
      <Gallery key={vessel.id} locale={locale} images={images} title={vesselName} />
      <div className={styles.vesselInfo}>
        <div className={styles.specifications}><h2>{local(locale, "Vessel details", "รายละเอียดเรือ")}</h2><dl>
          <div><dt>{local(locale, "Vessel name", "ชื่อเรือ")}</dt><dd>{vesselName}</dd></div>
          <div><dt>{local(locale, "Vessel type", "ประเภทเรือ")}</dt><dd><CategoryName locale={locale} category={vessel.type} categoryTh={vessel.typeTh} /></dd></div>
          {specificationRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          {!specificationRows.length && <div><dt>{local(locale, "Specifications", "ข้อมูลทางเทคนิค")}</dt><dd>{local(locale, "Pending verification", "รอการยืนยัน")}</dd></div>}
          <div><dt>{local(locale, "Availability", "ความพร้อมให้บริการ")}</dt><dd>{availability || local(locale, "Pending confirmation", "รอการยืนยัน")}</dd></div>
        </dl></div>
        <p className={styles.vesselDescription}>{vessel.description[locale]}</p>
        <ContentBody text={vessel.body[locale]} />
        <Action locale={locale} to={`contact?subject=${encodeURIComponent(vesselName)}`}>{local(locale, "Enquire about this vessel", "สอบถามเกี่ยวกับเรือลำนี้")}</Action>
      </div>
    </section>
    {planning && <section className={styles.vesselPlanning} aria-label={local(locale, "Planning a vessel enquiry", "ข้อมูลสำหรับสอบถามเรื่องเรือ")}><div><p className="eyebrow">{contentText(planning,"eyebrow",locale)}</p><h2>{contentText(planning,"title",locale)}</h2></div><div><p>{contentText(planning,"description",locale)}</p><ContentBody text={contentText(planning,"body",locale)} /></div></section>}
  </div>;
}

function Articles({ locale, page, slug }: { locale: Locale; page: "projects" | "news"; slug?: string }) {
  const { projects, news, pages, sections } = usePublicContent();
  const pageRecord = pages.find((item) => item.id === page);
  const planning = sections.find((item) => item.id === "project-planning" && item.parentId === "projects");
  const items: readonly Article[] = page === "projects" ? projects : news;
  const categories = ["All", ...new Set(items.map((item) => item.category))];
  const { category, query, setCategory, setQuery, reset } = useListingFilters(categories);
  const searchRef = useRef<HTMLInputElement>(null);
  function resetFilters() {
    reset();
    searchRef.current?.focus();
  }
  const isNews = page === "news";
  const title = contentText(pageRecord, "title", locale);
  const eyebrow = contentText(pageRecord, "eyebrow", locale);
  const description = contentText(pageRecord, "description", locale);
  if (slug) {
    const article = items.find((item) => item.id === slug);
    if (!article) return <MissingEntry locale={locale} page={page} />;
    const nextArticle = items.find((item) => item.id !== article.id);
    return <div className="container section">
      <BackLink locale={locale} page={page} />
      <article className={`${styles.articleDetail} ${isNews ? styles.newsDetail : styles.projectDetail}`}>
        <div className={styles.articleHeader}>
          <p className="eyebrow"><CategoryName locale={locale} category={article.category} categoryTh={article.categoryTh} /></p>
          <h1>{article.title[locale]}</h1>
          <p className={styles.lead}>{article.description[locale]}</p>
          {article.date && <time className={styles.date} dateTime={article.date}>{formatDate(locale, article.date)}</time>}
        </div>
        <div className={styles.articleImage}><Image src={article.image} alt={article.imageAlt[locale] || article.title[locale]} fill priority sizes="100vw" /></div>
        <div className={styles.articleEditorial}>
          <div className={styles.articleCopy}>
            <p className="eyebrow">{local(locale, isNews ? "THE ARTICLE" : "THE TOPIC", isNews ? "เนื้อหาบทความ" : "รายละเอียดหัวข้อ")}</p>
            <h2>{article.bodyHeading[locale] || local(locale,"Overview","ภาพรวม")}</h2>
            <ContentBody text={article.body[locale] || article.description[locale]} />
          </div>
          <aside className={styles.articleAside}>
            <p className="eyebrow">{local(locale, isNews ? "READ NEXT" : "PLAN A CONVERSATION", isNews ? "อ่านต่อ" : "เตรียมข้อมูลก่อนพูดคุย")}</p>
            {isNews ? <>
              <h2>{local(locale, "More maritime perspectives", "บทความเกี่ยวกับการเดินเรือเพิ่มเติม")}</h2>
              {nextArticle ? <Link className={styles.asideLink} href={listingHref(href(locale, `news/${nextArticle.id}`), { query, category })}><span>{nextArticle.title[locale]}</span><ArrowRight aria-hidden="true" size={20} /></Link> : <Link className={styles.asideLink} href={href(locale, "news")}><span>{local(locale, "Browse all articles", "ดูบทความทั้งหมด")}</span><ArrowRight aria-hidden="true" size={20} /></Link>}
            </> : <>
              {planning && <><h2>{contentText(planning,"title",locale)}</h2><p>{contentText(planning,"description",locale)}</p><ContentBody text={contentText(planning,"body",locale)} /></>}
              <Action locale={locale} to={`contact?subject=${encodeURIComponent(article.title[locale])}`}>{local(locale, "Prepare an enquiry", "ติดต่อสอบถาม")}</Action>
            </>}
          </aside>
        </div>
      </article>
    </div>;
  }
  const categoryTranslations = Object.fromEntries(categories.map((name) => [name, items.find((item) => item.category === name && item.categoryTh)?.categoryTh]));
  const filtered = items.filter((item) => (category === "All" || category === item.category) && matchesListingSearch(query, [item.title.en, item.title.th, item.description.en, item.description.th, item.category, categoryName("th", item.category, item.categoryTh)]));
  const [featured, ...remaining] = filtered;
  return <div className="container section">
    <Heading eyebrow={eyebrow} title={title} description={description} hideTitle={isNews} />
    <Filters locale={locale} categories={categories} categoryTranslations={categoryTranslations} selected={category} onSelect={setCategory} query={query} onQuery={setQuery} searchRef={searchRef} placeholder={local(locale, isNews ? "Search articles" : "Search topics", isNews ? "ค้นหาบทความ" : "ค้นหาหัวข้อ")} />
    <ResultsSummary locale={locale} active={category !== "All" || Boolean(query)} reset={resetFilters}>{local(locale, `${filtered.length} ${isNews ? (filtered.length === 1 ? "article" : "articles") : (filtered.length === 1 ? "topic" : "topics")}`, `${filtered.length} ${isNews ? "บทความ" : "หัวข้อ"}`)}</ResultsSummary>
    {featured ? isNews ? <>
      <Link href={listingHref(href(locale, `news/${featured.id}`), { query, category })} className={styles.newsFeature}>
        <div className={styles.newsFeatureImage}><Image src={featured.image} alt={featured.imageAlt[locale] || featured.title[locale]} fill priority sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className={styles.newsFeatureCopy}><p className="eyebrow"><CategoryName locale={locale} category={featured.category} categoryTh={featured.categoryTh} /></p>{featured.date && <time className={styles.date} dateTime={featured.date}>{formatDate(locale, featured.date)}</time>}<h2>{featured.title[locale]}</h2><p>{featured.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Read article", "อ่านบทความ")}<ArrowRight aria-hidden="true" size={19} /></span></div>
      </Link>
      {remaining.length > 0 && <div className={styles.newsList}>{remaining.map((item) => <Link className={styles.newsListItem} href={listingHref(href(locale, `news/${item.id}`), { query, category })} key={item.id}><div className={styles.newsListImage}><Image src={item.image} alt={item.imageAlt[locale] || item.title[locale]} fill sizes="(max-width: 540px) 100vw, (max-width: 650px) 30vw, 14vw" /></div><div><p className="eyebrow"><CategoryName locale={locale} category={item.category} categoryTh={item.categoryTh} /></p><h2>{item.title[locale]}</h2>{item.date && <time className={styles.date} dateTime={item.date}>{formatDate(locale, item.date)}</time>}<span className={styles.cardAction}>{local(locale, "Read article", "อ่านบทความ")}<ArrowRight aria-hidden="true" size={18} /></span></div></Link>)}</div>}
    </> : <>
      <Link href={listingHref(href(locale, `projects/${featured.id}`), { query, category })} className={styles.projectFeature}>
        <div className={styles.projectFeatureImage}><Image src={featured.image} alt={featured.imageAlt[locale] || featured.title[locale]} fill priority sizes="(max-width: 760px) 100vw, 60vw" /></div>
        <div className={styles.projectFeatureCopy}><p className="eyebrow"><CategoryName locale={locale} category={featured.category} categoryTh={featured.categoryTh} /></p><h2>{featured.title[locale]}</h2><p>{featured.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Explore topic", "อ่านรายละเอียด")}<ArrowRight aria-hidden="true" size={19} /></span></div>
      </Link>
      {remaining.length > 0 && <div className={styles.projectGrid}>{remaining.map((item) => <Link href={listingHref(href(locale, `projects/${item.id}`), { query, category })} key={item.id} className={styles.projectCard}><div className={styles.projectImage}><Image src={item.image} alt={item.imageAlt[locale] || item.title[locale]} fill sizes="(max-width: 650px) 100vw, 50vw" /></div><div className={styles.projectCardBody}><span><CategoryName locale={locale} category={item.category} categoryTh={item.categoryTh} /></span><h2>{item.title[locale]}</h2><p>{item.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Explore topic", "อ่านรายละเอียด")}<ArrowRight aria-hidden="true" size={18} /></span></div></Link>)}</div>}
    </> : <Empty locale={locale} reset={resetFilters} />}
    <ContentBody text={contentText(pageRecord,"body",locale)} /><AdditionalSections pageId={page} locale={locale} exclude={page === "projects" ? ["project-planning"] : []} />
  </div>;
}

function formatDate(locale: Locale, value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function MissingEntry({ locale, page }: { locale: Locale; page: string }) {
  return <div className="container section"><div className={styles.empty}><Anchor size={38} aria-hidden="true" /><h1>{local(locale, "This item is not available", "ไม่พบรายการนี้")}</h1><p>{local(locale, "It may have been removed from the website.", "รายการนี้อาจถูกนำออกจากเว็บไซต์แล้ว")}</p><Action locale={locale} to={page}>{local(locale, "Return to the collection", "กลับไปยังรายการทั้งหมด")}</Action></div></div>;
}

function CustomPage({ locale, page }: { locale: Locale; page: string }) {
  const { pages, settings } = usePublicContent();
  const record = pages.find((item) => item.id === page);
  if (!record) return <MissingEntry locale={locale} page="" />;
  return <div className="container section"><Heading eyebrow={contentText(record,"eyebrow",locale) || local(locale,settings.companyName,settings.companyNameTh)} title={local(locale, record.title, record.titleTh)} description={local(locale, record.description, record.descriptionTh)} />
    <div className={styles.articleImage}><Image src={record.image} alt={local(locale, record.imageAlt || record.title, record.imageAltTh || record.titleTh)} fill priority sizes="100vw" /></div>
    <ContentBody text={local(locale, record.body || "", record.bodyTh || "")} />
    <AdditionalSections pageId={page} locale={locale} />
    <Callout locale={locale} />
  </div>;
}

export function ContentPage({ locale, page, slug }: PageProps) {
  if (page === "about") return <About locale={locale} />;
  if (page === "services") return <Services locale={locale} slug={slug} />;
  if (page === "fleet") return <Fleet locale={locale} slug={slug} />;
  if (page === "routes") return <RoutesPage locale={locale} />;
  if (page === "projects" || page === "news") return <Articles locale={locale} page={page} slug={slug} />;
  if (page === "contact") return <ContactPage locale={locale} />;
  if (page === "privacy") return <PrivacyPage locale={locale} />;
  return <CustomPage locale={locale} page={page} />;
}

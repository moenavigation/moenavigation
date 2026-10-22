"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Anchor, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Compass, Container, Fuel, LifeBuoy, MapPin, Maximize2, RotateCcw, Search, ShieldCheck, Ship, Waves } from "lucide-react";
import { href, local, news as seedNews, projects as seedProjects, type Locale } from "@/lib/content";
import { categoryName } from "@/lib/category-name";
import { demoStories } from "@/lib/demo-stories";
import { demoSeed } from "@/lib/demo-store";
import { useDemoContent } from "@/lib/use-demo-content";
import Dialog from "./Dialog";
import InteractiveRouteMap from "./InteractiveRouteMap";
import styles from "./ContentPages.module.css";

type PageProps = { locale: Locale; page: string; slug?: string };
type Article = { id: string; title: { en: string; th: string }; description: { en: string; th: string }; image: string; category: string; categoryTh?: string; date?: string };
const serviceIcons = { Ship, Fuel, Container, Compass, Anchor, LifeBuoy };
const vesselGalleryDetails: Record<string, string[]> = {
  "ranong-moe": ["/images/container-deck-detail.webp", "/images/port.webp", "/images/bridge.webp"],
  "moe-line-2": ["/images/logistics.webp", "/images/container-deck-detail.webp", "/images/crane.webp"],
  "moe-line-3": ["/images/tanker-deck-detail.webp", "/images/hero.webp", "/images/bunkering.webp"],
  "moe-line-5": ["/images/container-deck-detail.webp", "/images/port.webp", "/images/logistics.webp"],
  "moe-line-6": ["/images/tanker-deck-detail.webp", "/images/tugboat.webp", "/images/bridge.webp"],
  "moe-line-7": ["/images/crane-lift-detail.webp", "/images/tugboat.webp", "/images/port.webp"],
};

function Action({ locale, to = "contact", children, secondary = false }: { locale: Locale; to?: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`button ${secondary ? "secondary" : ""}`} href={href(locale, to)}>{children}<ArrowRight aria-hidden="true" size={20} /></Link>;
}

function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className={styles.heading}><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className={styles.lead}>{description}</p></div>{action}</div>;
}

function PreviewNote({ children }: { children: ReactNode }) {
  return <p className={styles.previewNote}>{children}</p>;
}

function CategoryName({ locale, category, categoryTh }: { locale: Locale; category: string; categoryTh?: string }) {
  return <>{categoryName(locale, category, categoryTh)}</>;
}

function Callout({ locale, image = "/images/port.webp" }: { locale: Locale; image?: string }) {
  return <section className={styles.callout}><Image src={image} alt="" fill sizes="100vw" /><div className={styles.calloutContent}><p className="eyebrow">{local(locale, "LET’S TALK", "พูดคุยกับเรา")}</p><h2>{local(locale, "Have an operation in mind?", "มีแผนการเดินเรือที่ต้องการปรึกษา?")}</h2><p>{local(locale, "Tell us about your vessels, cargo and next destination.", "บอกเราเกี่ยวกับเรือ สินค้า และจุดหมายปลายทางของคุณ")}</p><Action locale={locale}>{local(locale, "Contact our team", "ติดต่อทีมงาน")}</Action></div></section>;
}

function About({ locale }: { locale: Locale }) {
  const { pages } = useDemoContent();
  const page = pages.find((item) => item.id === "about");
  const title = page ? local(locale, page.title, page.titleTh) : local(locale, "About us", "เกี่ยวกับเรา");
  const description = page ? local(locale, page.description, page.descriptionTh) : local(locale, "People and purpose behind every voyage.", "ผู้คนและเป้าหมายเบื้องหลังทุกการเดินทาง");
  const values = [
    { icon: Compass, title: local(locale, "Our vision", "วิสัยทัศน์"), text: local(locale, "Better connections across the maritime industry.", "เชื่อมโยงโอกาสในอุตสาหกรรมการเดินเรือ") },
    { icon: MapPin, title: local(locale, "Our mission", "พันธกิจ"), text: local(locale, "Marine services shaped around your operational needs.", "บริการทางทะเลที่สอดคล้องกับความต้องการของแต่ละงาน") },
    { icon: ShieldCheck, title: local(locale, "Our values", "คุณค่าที่เรายึดถือ"), text: local(locale, "Clear communication. Accountability. Respect.", "สื่อสารชัดเจน รับผิดชอบ และเคารพกัน") },
  ];
  return <><section className={styles.aboutHero}><Image src={page?.image || "/images/container-vessel.webp"} alt={local(locale, "Illustrative maritime operations", "ภาพประกอบงานปฏิบัติการทางทะเล")} fill priority sizes="100vw" /><div className={`container ${styles.heroCopy}`}><p className="eyebrow">{local(locale, "OUR COMPANY", "เกี่ยวกับบริษัท")}</p><h1>{title}</h1><p>{description}</p></div></section><div className="container section"><section className={styles.aboutIntro}><div className={styles.aboutPhoto}><Image src="/images/port.webp" alt={local(locale, "Illustrative port and container operations", "ภาพประกอบท่าเรือและงานคอนเทนเนอร์")} fill sizes="(max-width: 760px) 100vw, 50vw" /></div><div className={styles.aboutCopy}><p className="eyebrow">{local(locale, "WHO WE ARE", "แนวทางของเรา")}</p><h2>{local(locale, "A clear purpose.\nA practical approach.", "เป้าหมายชัดเจน\nแนวทางที่ลงมือได้จริง")}</h2><p>{local(locale, "Every operation starts with understanding your needs. Our approach brings together careful planning, clear communication and practical maritime support.", "ทุกงานเริ่มจากการทำความเข้าใจความต้องการของคุณ เราผสานการวางแผนอย่างรอบคอบ การสื่อสารที่ชัดเจน และการสนับสนุนงานทางทะเลที่เหมาะสม")}</p><Link className={styles.textLink} href={href(locale, "services")}>{local(locale, "Explore our services", "ดูบริการของเรา")}<ArrowRight size={20} aria-hidden="true" /></Link></div></section><section className={styles.values} aria-label={local(locale, "Vision, mission and values", "วิสัยทัศน์ พันธกิจ และคุณค่า")}>{values.map(({ icon: Icon, title, text }) => <article key={title}><span className={styles.valueIcon}><Icon aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></article>)}</section><Callout locale={locale} /></div></>;
}

function Services({ locale, slug }: { locale: Locale; slug?: string }) {
  const { services, pages } = useDemoContent();
  const page = pages.find((item) => item.id === "services");
  const title = page ? local(locale, page.title, page.titleTh) : local(locale, "Our services", "บริการของเรา");
  const description = page ? local(locale, page.description, page.descriptionTh) : local(locale, "Support for your vessels, cargo and marine operations.", "ดูแลเรือ สินค้า และงานปฏิบัติการทางทะเลของคุณ");
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
        <PreviewNote>{local(locale, "Illustrative service overview. Scope and availability need confirmation.", "ภาพรวมบริการตัวอย่าง ต้องยืนยันขอบเขตงานและความพร้อมให้บริการ")}</PreviewNote>
      </header>
      <section className={styles.serviceDetail} aria-label={local(locale, "Discuss this service", "พูดคุยเกี่ยวกับบริการนี้")}>
        <div className={styles.detailPhoto}><Image src={service.image} alt={local(locale, `Illustrative scene for ${service.title.en}`, `ภาพประกอบสำหรับ${service.title.th}`)} fill priority sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className={styles.serviceDetailCopy}>
          <span className={styles.detailIcon}><Icon size={34} aria-hidden="true" /></span>
          <p className="eyebrow">{local(locale, "PLAN THE RIGHT SUPPORT", "วางแผนการสนับสนุน")}</p>
          <h2>{local(locale, "Start with the operation.", "เริ่มจากรายละเอียดงาน")}</h2>
          <p>{local(locale, "A useful enquiry describes the work, where it is needed and when it should happen. The team can then discuss a suitable scope.", "คำขอที่ชัดเจนควรระบุลักษณะงาน สถานที่ และช่วงเวลาที่ต้องการ จากนั้นทีมงานจึงหารือขอบเขตที่เหมาะสมได้")}</p>
          <ul className={styles.enquiryList}>
            <li><span>01</span>{local(locale, "Operational requirements", "ความต้องการของงาน")}</li>
            <li><span>02</span>{local(locale, "Port or operating area", "ท่าเรือหรือพื้นที่ดำเนินงาน")}</li>
            <li><span>03</span>{local(locale, "Preferred timing", "ช่วงเวลาที่ต้องการ")}</li>
          </ul>
          <Action locale={locale} to={`contact?subject=${encodeURIComponent(service.title[locale])}`}>{local(locale, "Discuss this service", "สอบถามบริการนี้")}</Action>
        </div>
      </section>
      {related.length > 0 && <section className={styles.relatedSection} aria-label={local(locale, "Other services", "บริการอื่น ๆ")}>
        <div className={styles.relatedHeading}><p className="eyebrow">{local(locale, "EXPLORE MORE", "สำรวจเพิ่มเติม")}</p><h2>{local(locale, "Other services", "บริการอื่น ๆ")}</h2></div>
        <div className={styles.relatedLinks}>{related.map((item) => <Link key={item.id} href={href(locale, `services/${item.id}`)}><span>{item.title[locale]}</span><ArrowRight aria-hidden="true" size={19} /></Link>)}</div>
      </section>}
    </div>;
  }
  const [featured, ...more] = services;
  return <div className="container section">
    <Heading eyebrow={local(locale, "OUR EXPERTISE", "ความเชี่ยวชาญของเรา")} title={title} description={description} />
    <PreviewNote>{local(locale, "Preview of possible services. Confirmed capabilities and availability will be added later.", "ตัวอย่างบริการที่อาจนำเสนอ ข้อมูลความสามารถและความพร้อมที่ยืนยันแล้วจะเพิ่มเติมภายหลัง")}</PreviewNote>
    {featured ? <>
      <Link className={styles.serviceFeature} href={href(locale, `services/${featured.id}`)}>
        <div className={styles.serviceFeaturePhoto}><Image src={featured.image} alt={local(locale, `Illustrative scene for ${featured.title.en}`, `ภาพประกอบสำหรับ${featured.title.th}`)} fill priority sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className={styles.serviceFeatureCopy}><p className="eyebrow">{local(locale, "SERVICE 01", "บริการ 01")}</p><h2>{featured.title[locale]}</h2><p>{featured.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Explore service", "ดูรายละเอียดบริการ")}<ArrowRight aria-hidden="true" size={19} /></span></div>
      </Link>
      {more.length > 0 && <div className={styles.capabilityGrid}>{more.map((item, index) => { const Icon = serviceIcons[item.icon as keyof typeof serviceIcons] || Ship; return <Link className={styles.capabilityCard} key={item.id} href={href(locale, `services/${item.id}`)}><div className={styles.capabilityImage}><Image src={item.image} alt={local(locale, `Illustrative scene for ${item.title.en}`, `ภาพประกอบสำหรับ${item.title.th}`)} fill sizes="(max-width: 650px) 100vw, (max-width: 850px) 25vw, 15vw" /></div><div className={styles.capabilityCopy}><span className={styles.capabilityIndex}>{String(index + 2).padStart(2, "0")}</span><Icon size={24} aria-hidden="true" /><h2>{item.title[locale]}</h2><p>{item.description[locale]}</p><span className={styles.cardAction}>{local(locale, "View service", "ดูบริการ")}<ArrowRight aria-hidden="true" size={18} /></span></div></Link>; })}</div>}
    </> : <div className={styles.empty}><Ship size={35} aria-hidden="true" /><h2>{local(locale, "No demo services published yet", "ยังไม่มีบริการตัวอย่างที่เผยแพร่")}</h2><p>{local(locale, "Published services will appear here.", "บริการที่เผยแพร่จะแสดงที่นี่")}</p></div>}
    <Callout locale={locale} image={page?.image} />
  </div>;
}

function Filters({ locale, categories, categoryTranslations, selected, onSelect, query, onQuery, placeholder }: { locale: Locale; categories: string[]; categoryTranslations?: Record<string, string | undefined>; selected: string; onSelect: (value: string) => void; query: string; onQuery: (value: string) => void; placeholder: string }) {
  return <div className={styles.filters}><div className={styles.filterButtons} role="group" aria-label={local(locale, "Filter by category", "กรองตามประเภท")}>{categories.map((category) => <button type="button" key={category} aria-pressed={selected === category} className={selected === category ? styles.activeFilter : ""} onClick={() => onSelect(category)}><CategoryName locale={locale} category={category} categoryTh={categoryTranslations?.[category]} /></button>)}</div><label className={styles.search}><Search size={21} aria-hidden="true" /><span className="sr-only">{placeholder}</span><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} /></label></div>;
}

function Empty({ locale, reset }: { locale: Locale; reset: () => void }) {
  return <div className={styles.empty}><Search size={32} aria-hidden="true" /><h2>{local(locale, "No matching results", "ไม่พบผลลัพธ์ที่ตรงกัน")}</h2><p>{local(locale, "Try a different keyword or choose another category.", "ลองค้นหาด้วยคำอื่น หรือเลือกประเภทอื่น")}</p><button className="button secondary" type="button" onClick={reset}>{local(locale, "Clear filters", "ล้างตัวกรอง")}<RotateCcw size={18} aria-hidden="true" /></button></div>;
}

function Fleet({ locale, slug }: { locale: Locale; slug?: string }) {
  const { vessels } = useDemoContent();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  if (slug) return <VesselDetail locale={locale} slug={slug} />;
  const categories = ["All", ...new Set(vessels.map((item) => item.type))];
  const categoryTranslations = Object.fromEntries(categories.map((type) => [type, vessels.find((item) => item.type === type && item.typeTh)?.typeTh]));
  const filtered = vessels.filter((item) => (category === "All" || category === item.type) && `${item.name} ${item.nameTh} ${item.type} ${item.typeTh || ""} ${item.description[locale]}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="container section">
    <Heading eyebrow={local(locale, "VESSEL COLLECTION", "คอลเลกชันเรือ")} title={local(locale, "Our fleet", "กองเรือของเรา")} description={local(locale, "Explore vessel concepts and view individual details.", "สำรวจตัวอย่างเรือและดูรายละเอียดแต่ละลำ")} />
    <PreviewNote>{local(locale, "Demo vessel collection. Ownership, specifications and availability have not been verified.", "คอลเลกชันเรือตัวอย่าง ยังไม่ได้ยืนยันเจ้าของเรือ ข้อมูลทางเทคนิค และความพร้อมใช้งาน")}</PreviewNote>
    <Filters locale={locale} categories={categories} categoryTranslations={categoryTranslations} selected={category} onSelect={setCategory} query={query} onQuery={setQuery} placeholder={local(locale, "Search vessels", "ค้นหาเรือ")} />
    <p className={styles.resultCount} aria-live="polite">{local(locale, `${filtered.length} ${filtered.length === 1 ? "vessel" : "vessels"}`, `${filtered.length} ลำ`)}</p>
    {filtered.length ? <div className={styles.fleetGrid}>{filtered.map((item, index) => <Link href={href(locale, `fleet/${item.id}`)} key={item.id} className={styles.fleetCard}>
      <Image src={item.image} alt={local(locale, `Illustrative view of ${item.name}`, `ภาพประกอบเรือ ${item.nameTh}`)} fill priority={index === 0} sizes="(max-width: 650px) 100vw, (max-width: 1100px) 50vw, 33vw" />
      <span className={styles.fleetType}><CategoryName locale={locale} category={item.type} categoryTh={item.typeTh} /></span>
      <span className={styles.fleetCardInfo}><strong>{local(locale, item.name, item.nameTh)}</strong><span>{local(locale, "View vessel", "ดูข้อมูลเรือ")}<ArrowRight aria-hidden="true" size={19} /></span></span>
    </Link>)}</div> : <Empty locale={locale} reset={() => { setCategory("All"); setQuery(""); }} />}
  </div>;
}

function BackLink({ locale, page }: { locale: Locale; page: string }) {
  const names: Record<string, [string, string]> = { fleet: ["Back to fleet", "กลับไปยังกองเรือ"], services: ["Back to services", "กลับไปยังบริการ"], projects: ["Back to projects", "กลับไปยังโครงการ"], news: ["Back to news", "กลับไปยังข่าวสาร"] };
  return <Link className={styles.back} href={href(locale, page)}><ArrowLeft size={20} aria-hidden="true" />{local(locale, ...(names[page] || ["Back", "กลับ"] as [string, string]))}</Link>;
}

function Gallery({ locale, images, title }: { locale: Locale; images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const change = (amount: number) => setIndex((current) => (current + amount + images.length) % images.length);
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((current) => (current - 1 + images.length) % images.length); } if (event.key === "ArrowRight") { event.preventDefault(); setIndex((current) => (current + 1) % images.length); } };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, images.length]);
  const controls = images.length > 1 ? <><button className={`${styles.galleryControl} ${styles.prev}`} type="button" onClick={() => change(-1)} aria-label={local(locale, "Previous image", "ภาพก่อนหน้า")}><ChevronLeft aria-hidden="true" /></button><button className={`${styles.galleryControl} ${styles.next}`} type="button" onClick={() => change(1)} aria-label={local(locale, "Next image", "ภาพถัดไป")}><ChevronRight aria-hidden="true" /></button><span className={styles.counter} aria-live="polite">{index + 1} / {images.length}</span></> : null;
  return <div className={styles.gallery}><div className={styles.galleryMain}><Image src={images[index]} alt={`${title} — ${local(locale, "illustrative image", "ภาพประกอบ")} ${index + 1}`} fill priority sizes="(max-width: 850px) 100vw, 65vw" /><button className={`${styles.galleryControl} ${styles.expand}`} type="button" onClick={() => setOpen(true)} aria-label={local(locale, "Open image gallery", "เปิดแกลเลอรีภาพ")}><Maximize2 size={21} aria-hidden="true" /></button>{controls}</div>{images.length > 1 && <div className={styles.thumbnails}>{images.map((src, thumbnail) => <button type="button" key={`${src}-${thumbnail}`} aria-label={local(locale, `Show image ${thumbnail + 1}`, `แสดงภาพที่ ${thumbnail + 1}`)} aria-pressed={index === thumbnail} onClick={() => setIndex(thumbnail)}><Image src={src} alt="" fill sizes="(max-width: 850px) 25vw, 16vw" /></button>)}</div>}<Dialog open={open} onClose={() => setOpen(false)} title={title} closeLabel={local(locale, "Close gallery", "ปิดแกลเลอรี")}><div className={styles.lightbox}><Image src={images[index]} alt={`${title} — ${local(locale, "illustrative image", "ภาพประกอบ")} ${index + 1}`} fill sizes="95vw" />{controls}</div><p className={styles.lightboxCaption}>{images.length > 1 ? local(locale, "Generated illustrative photography. Use the arrows or arrow keys to explore.", "ภาพประกอบที่สร้างขึ้น เลื่อนดูด้วยปุ่มลูกศรหรือแป้นลูกศร") : local(locale, "Illustrative demo photography.", "ภาพประกอบสำหรับเว็บไซต์ตัวอย่าง")}</p></Dialog></div>;
}

function VesselDetail({ locale, slug }: { locale: Locale; slug: string }) {
  const { vessels } = useDemoContent();
  const vessel = vessels.find((item) => item.id === slug);
  if (!vessel) return <MissingEntry locale={locale} page="fleet" />;
  const images = [...new Set([vessel.image, ...(vesselGalleryDetails[vessel.id] || [])])];
  const vesselName = local(locale, vessel.name, vessel.nameTh);
  return <div className="container section">
    <BackLink locale={locale} page="fleet" />
    <section className={styles.vesselDetail}>
      <header className={styles.vesselTitle}><p className="eyebrow">{local(locale, "VESSEL PROFILE", "ข้อมูลเรือ")}</p><h1>{vesselName}</h1><p className={styles.lead}><CategoryName locale={locale} category={vessel.type} categoryTh={vessel.typeTh} /></p><PreviewNote>{local(locale, "Demo listing with illustrative imagery. Vessel details require verification.", "รายการเรือตัวอย่างพร้อมภาพประกอบ รายละเอียดเรือต้องได้รับการยืนยัน")}</PreviewNote></header>
      <Gallery locale={locale} images={images} title={vesselName} />
      <div className={styles.vesselInfo}>
        <div className={styles.specifications}><h2>{local(locale, "Currently shown", "ข้อมูลที่แสดงตอนนี้")}</h2><dl>
          <div><dt>{local(locale, "Vessel name", "ชื่อเรือ")}</dt><dd>{vesselName}</dd></div>
          <div><dt>{local(locale, "Vessel type", "ประเภทเรือ")}</dt><dd><CategoryName locale={locale} category={vessel.type} categoryTh={vessel.typeTh} /></dd></div>
          <div><dt>{local(locale, "Specifications", "ข้อมูลทางเทคนิค")}</dt><dd>{local(locale, "Pending verification", "รอการยืนยัน")}</dd></div>
          <div><dt>{local(locale, "Availability", "ความพร้อมใช้งาน")}</dt><dd>{local(locale, "Pending confirmation", "รอการยืนยัน")}</dd></div>
        </dl></div>
        <p className={styles.vesselDescription}>{vessel.description[locale]}</p>
        <Action locale={locale} to={`contact?subject=${encodeURIComponent(vesselName)}`}>{local(locale, "Enquire about this vessel", "สอบถามเกี่ยวกับเรือลำนี้")}</Action>
      </div>
    </section>
    <section className={styles.vesselPlanning} aria-label={local(locale, "Planning a vessel enquiry", "เตรียมข้อมูลสอบถามเรือ")}>
      <div><p className="eyebrow">{local(locale, "BEFORE AN ENQUIRY", "ก่อนสอบถาม")}</p><h2>{local(locale, "The details that shape a vessel match", "ข้อมูลที่ช่วยเลือกเรือให้เหมาะกับงาน")}</h2></div>
      <p>{local(locale, "Cargo, route and preferred dates all affect which vessel may be suitable. Include these in your enquiry; dimensions, capacity and operating status need direct confirmation.", "สินค้า เส้นทาง และช่วงเวลาที่ต้องการมีผลต่อการเลือกเรือที่เหมาะสม โปรดแจ้งข้อมูลเหล่านี้ในการสอบถาม ส่วนขนาด ความจุ และสถานะการปฏิบัติงานต้องยืนยันโดยตรง")}</p>
    </section>
  </div>;
}

function Articles({ locale, page, slug }: { locale: Locale; page: "projects" | "news"; slug?: string }) {
  const { projects, news } = useDemoContent();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const items: readonly Article[] = page === "projects" ? projects : news;
  const isNews = page === "news";
  if (slug) {
    const article = items.find((item) => item.id === slug);
    if (!article) return <MissingEntry locale={locale} page={page} />;
    const seed = (isNews ? seedNews : seedProjects).find((item) => item.id === article.id);
    const story = seed?.title.en === article.title.en && seed.title.th === article.title.th
      && seed.description.en === article.description.en && seed.description.th === article.description.th
      && seed.image === article.image && seed.category === article.category
      ? demoStories[`${page}/${article.id}`]
      : undefined;
    const nextArticle = items.find((item) => item.id !== article.id);
    return <div className="container section">
      <BackLink locale={locale} page={page} />
      <article className={`${styles.articleDetail} ${isNews ? styles.newsDetail : styles.projectDetail}`}>
        <div className={styles.articleHeader}>
          <p className="eyebrow"><CategoryName locale={locale} category={article.category} categoryTh={article.categoryTh} /></p>
          <h1>{article.title[locale]}</h1>
          <p className={styles.lead}>{article.description[locale]}</p>
          {article.date && <time className={styles.date} dateTime={article.date}>{formatDate(locale, article.date)}</time>}
          <PreviewNote>{local(locale, isNews ? "Sample editorial content and illustrative imagery; not a published company announcement." : "Illustrative project scenario; not a record of completed company work.", isNews ? "เนื้อหาบทความและภาพประกอบตัวอย่าง ไม่ใช่ประกาศที่เผยแพร่โดยบริษัท" : "ตัวอย่างสถานการณ์โครงการ ไม่ใช่บันทึกผลงานที่บริษัทดำเนินการแล้ว")}</PreviewNote>
        </div>
        <div className={styles.articleImage}><Image src={article.image} alt={local(locale, `Illustrative scene for ${article.title.en}`, `ภาพประกอบสำหรับ ${article.title.th}`)} fill priority sizes="100vw" /></div>
        <div className={styles.articleEditorial}>
          <div className={styles.articleCopy}>
            <p className="eyebrow">{local(locale, isNews ? "THE STORY" : "THE SCENARIO", isNews ? "เนื้อหา" : "สถานการณ์ตัวอย่าง")}</p>
            <h2>{story ? story.heading[locale] : local(locale, "About this example", "เกี่ยวกับตัวอย่างนี้")}</h2>
            {story
              ? story.paragraphs.map((paragraph, index) => <p key={index}>{paragraph[locale]}</p>)
              : <><p>{article.description[locale]}</p><p>{local(locale, "Further details will be added when verified information is available.", "รายละเอียดเพิ่มเติมจะเพิ่มเมื่อมีข้อมูลที่ผ่านการยืนยัน")}</p></>}
          </div>
          <aside className={styles.articleAside}>
            <p className="eyebrow">{local(locale, isNews ? "READ NEXT" : "PLAN A CONVERSATION", isNews ? "อ่านต่อ" : "เตรียมข้อมูลก่อนพูดคุย")}</p>
            {isNews ? <>
              <h2>{local(locale, "More maritime perspectives", "มุมมองทางทะเลเพิ่มเติม")}</h2>
              {nextArticle ? <Link className={styles.asideLink} href={href(locale, `news/${nextArticle.id}`)}><span>{nextArticle.title[locale]}</span><ArrowRight aria-hidden="true" size={20} /></Link> : <Link className={styles.asideLink} href={href(locale, "news")}><span>{local(locale, "Browse all articles", "ดูบทความทั้งหมด")}</span><ArrowRight aria-hidden="true" size={20} /></Link>}
            </> : <>
              <h2>{local(locale, "What would your project need?", "โครงการของคุณต้องการอะไร?")}</h2>
              <p>{local(locale, "Share the cargo or vessel, operating area and preferred timing. The actual scope can then be discussed.", "แจ้งข้อมูลสินค้า หรือเรือ พื้นที่ดำเนินงาน และช่วงเวลาที่ต้องการ เพื่อหารือขอบเขตงานจริง")}</p>
              <Action locale={locale} to={`contact?subject=${encodeURIComponent(article.title[locale])}`}>{local(locale, "Prepare an enquiry", "เตรียมข้อความสอบถาม")}</Action>
            </>}
          </aside>
        </div>
      </article>
    </div>;
  }
  const categories = ["All", ...new Set(items.map((item) => item.category))];
  const categoryTranslations = Object.fromEntries(categories.map((name) => [name, items.find((item) => item.category === name && item.categoryTh)?.categoryTh]));
  const filtered = items.filter((item) => (category === "All" || category === item.category) && `${item.title[locale]} ${item.description[locale]} ${item.category} ${item.categoryTh || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const [featured, ...remaining] = filtered;
  return <div className="container section">
    <Heading eyebrow={local(locale, isNews ? "INSIGHTS & UPDATES" : "OUR WORK", isNews ? "ข่าวสารและบทความ" : "ผลงานและโครงการ")} title={local(locale, isNews ? "News & updates" : "Our projects", isNews ? "ข่าวสารและอัปเดต" : "โครงการของเรา")} description={local(locale, isNews ? "Ideas and perspectives from the maritime world." : "Explore maritime and port operation scenarios.", isNews ? "แนวคิดและมุมมองจากโลกการเดินเรือ" : "สำรวจตัวอย่างสถานการณ์งานทางทะเลและงานท่าเรือ")} />
    <PreviewNote>{local(locale, isNews ? "Sample articles and dates for this website preview; company updates are pending." : "Illustrative project scenarios, not completed company work.", isNews ? "บทความและวันที่ตัวอย่างสำหรับเว็บไซต์นี้ ยังไม่มีข่าวบริษัทที่ยืนยันแล้ว" : "สถานการณ์โครงการตัวอย่าง ไม่ใช่ผลงานที่บริษัทดำเนินการแล้ว")}</PreviewNote>
    <Filters locale={locale} categories={categories} categoryTranslations={categoryTranslations} selected={category} onSelect={setCategory} query={query} onQuery={setQuery} placeholder={local(locale, isNews ? "Search news" : "Search projects", isNews ? "ค้นหาข่าวสาร" : "ค้นหาโครงการ")} />
    <p className={styles.resultCount} aria-live="polite">{local(locale, `${filtered.length} ${isNews ? (filtered.length === 1 ? "article" : "articles") : (filtered.length === 1 ? "project" : "projects")}`, `${filtered.length} ${isNews ? "บทความ" : "โครงการ"}`)}</p>
    {featured ? isNews ? <>
      <Link href={href(locale, `news/${featured.id}`)} className={styles.newsFeature}>
        <div className={styles.newsFeatureImage}><Image src={featured.image} alt={local(locale, `Illustrative scene for ${featured.title.en}`, `ภาพประกอบสำหรับ ${featured.title.th}`)} fill priority sizes="(max-width: 760px) 100vw, 55vw" /></div>
        <div className={styles.newsFeatureCopy}><p className="eyebrow"><CategoryName locale={locale} category={featured.category} categoryTh={featured.categoryTh} /></p>{featured.date && <time className={styles.date} dateTime={featured.date}>{formatDate(locale, featured.date)}</time>}<h2>{featured.title[locale]}</h2><p>{featured.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Read article", "อ่านบทความ")}<ArrowRight aria-hidden="true" size={19} /></span></div>
      </Link>
      {remaining.length > 0 && <div className={styles.newsList}>{remaining.map((item) => <Link className={styles.newsListItem} href={href(locale, `news/${item.id}`)} key={item.id}><div className={styles.newsListImage}><Image src={item.image} alt={local(locale, `Illustrative scene for ${item.title.en}`, `ภาพประกอบสำหรับ ${item.title.th}`)} fill sizes="(max-width: 380px) 100vw, (max-width: 650px) 30vw, 14vw" /></div><div><p className="eyebrow"><CategoryName locale={locale} category={item.category} categoryTh={item.categoryTh} /></p><h2>{item.title[locale]}</h2>{item.date && <time className={styles.date} dateTime={item.date}>{formatDate(locale, item.date)}</time>}<span className={styles.cardAction}>{local(locale, "Read article", "อ่านบทความ")}<ArrowRight aria-hidden="true" size={18} /></span></div></Link>)}</div>}
    </> : <>
      <Link href={href(locale, `projects/${featured.id}`)} className={styles.projectFeature}>
        <div className={styles.projectFeatureImage}><Image src={featured.image} alt={local(locale, `Illustrative scene for ${featured.title.en}`, `ภาพประกอบสำหรับ ${featured.title.th}`)} fill priority sizes="(max-width: 760px) 100vw, 60vw" /></div>
        <div className={styles.projectFeatureCopy}><p className="eyebrow"><CategoryName locale={locale} category={featured.category} categoryTh={featured.categoryTh} /></p><h2>{featured.title[locale]}</h2><p>{featured.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Explore scenario", "ดูสถานการณ์ตัวอย่าง")}<ArrowRight aria-hidden="true" size={19} /></span></div>
      </Link>
      {remaining.length > 0 && <div className={styles.projectGrid}>{remaining.map((item) => <Link href={href(locale, `projects/${item.id}`)} key={item.id} className={styles.projectCard}><div className={styles.projectImage}><Image src={item.image} alt={local(locale, `Illustrative scene for ${item.title.en}`, `ภาพประกอบสำหรับ ${item.title.th}`)} fill sizes="(max-width: 650px) 100vw, 50vw" /></div><div className={styles.projectCardBody}><span><CategoryName locale={locale} category={item.category} categoryTh={item.categoryTh} /></span><h2>{item.title[locale]}</h2><p>{item.description[locale]}</p><span className={styles.cardAction}>{local(locale, "Explore scenario", "ดูสถานการณ์ตัวอย่าง")}<ArrowRight aria-hidden="true" size={18} /></span></div></Link>)}</div>}
    </> : <Empty locale={locale} reset={() => { setCategory("All"); setQuery(""); }} />}
  </div>;
}

function formatDate(locale: Locale, value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

const routeOptions = [
  { id: "singapore", destination: "Singapore", destinationTh: "สิงคโปร์", country: { en: "Singapore", th: "สิงคโปร์" } },
  { id: "port-klang", destination: "Port Klang", destinationTh: "ท่าเรือคลัง", country: { en: "Malaysia", th: "มาเลเซีย" } },
  { id: "tanjung-priok", destination: "Tanjung Priok", destinationTh: "ตันจุงปริอ็อก", country: { en: "Jakarta, Indonesia", th: "จาการ์ตา อินโดนีเซีย" } },
] as const;

function Routes({ locale }: { locale: Locale }) {
  const { routes } = useDemoContent();
  const [selected, setSelected] = useState(0);
  const available = routeOptions.flatMap((option, index) => {
    const record = routes.find((item) => item.id === `laem-chabang-${option.id}`);
    return record ? [{ ...option, index, record }] : [];
  });
  const additional = routes.filter((item) => !routeOptions.some((option) => item.id === `laem-chabang-${option.id}`));
  const route = available.find((item) => item.index === selected) || available[0];
  const baseRoute = demoSeed.find((item) => item.type === "Route" && item.id === route?.record.id);
  const hasEditedDescription = route && (!baseRoute || route.record.description !== baseRoute.description || route.record.descriptionTh !== baseRoute.descriptionTh);
  return <div className="container section">
    <Heading eyebrow={local(locale, "REGIONAL CONNECTIONS", "เชื่อมโยงภูมิภาค")} title={local(locale, "Shipping routes", "เส้นทางเดินเรือ")} description={local(locale, "Explore connections across Southeast Asia.", "สำรวจการเชื่อมต่อในเอเชียตะวันออกเฉียงใต้")} />
    {route ? <section className={styles.routesLayout}>
      <div className={styles.map}>
        <InteractiveRouteMap locale={locale} selectedId={route.id} availableIds={available.map((item) => item.id)} onSelect={(id) => { const match = available.find((item) => item.id === id); if (match) setSelected(match.index); }} />
      </div>
      <div className={styles.routePanel}>
        <h2>{local(locale, "Explore our routes", "สำรวจเส้นทางของเรา")}</h2>
        <p>{local(locale, "Select a port-to-port connection.", "เลือกเส้นทางเชื่อมต่อระหว่างท่าเรือ")}</p>
        <div className={styles.routeOptions} role="group" aria-label={local(locale, "Shipping route", "เส้นทางเดินเรือ")}>
          {available.map((item) => <button type="button" className={route.index === item.index ? styles.selectedRoute : ""} aria-pressed={route.index === item.index} key={item.id} onClick={() => setSelected(item.index)}>
            <span className={styles.radio}>{route.index === item.index && <span />}</span>
            <span><strong>{local(locale, item.record.title, item.record.titleTh)}</strong><span>{local(locale, "Thailand", "ไทย")} <span aria-hidden="true">→</span> {item.country[locale]}</span></span>
            {route.index === item.index && <CheckCircle2 size={21} aria-hidden="true" className={styles.routeCheck} />}
          </button>)}
        </div>
        <div className={styles.selectedDetails}>
          <h3>{local(locale, "Selected route", "เส้นทางที่เลือก")}</h3>
          <dl><div><dt>{local(locale, "Origin", "ต้นทาง")}</dt><dd>{local(locale, "Laem Chabang", "แหลมฉบัง")}<span>{local(locale, "Thailand", "ไทย")}</span></dd></div><div><dt>{local(locale, "Destination", "ปลายทาง")}</dt><dd>{local(locale, route.destination, route.destinationTh)}<span>{route.country[locale]}</span></dd></div></dl>
        </div>
        {hasEditedDescription && <p className={styles.routeDisclaimer}>{local(locale, route.record.description, route.record.descriptionTh)}</p>}
        <p className={styles.routeDisclaimer}>{local(locale, "Demo routes only. Routing, schedules and service availability require confirmation.", "เส้นทางตัวอย่างเท่านั้น ต้องยืนยันเส้นทาง ตารางเดินเรือ และความพร้อมในการให้บริการ")}</p>
        <Action locale={locale} to={`contact?subject=${encodeURIComponent(local(locale, route.record.title, route.record.titleTh))}`}>{local(locale, "Enquire about this route", "สอบถามเกี่ยวกับเส้นทางนี้")}</Action>
      </div>
    </section> : <div className={styles.empty}><Compass size={35} aria-hidden="true" /><h2>{local(locale, "No demo routes published yet", "ยังไม่มีเส้นทางตัวอย่างที่เผยแพร่")}</h2><p>{local(locale, "Published route details will appear here. Tell us about the connection you have in mind.", "รายละเอียดเส้นทางที่เผยแพร่จะแสดงที่นี่ คุณสามารถแจ้งเส้นทางที่ต้องการสอบถามได้")}</p><Action locale={locale}>{local(locale, "Discuss a route", "สอบถามเส้นทาง")}</Action></div>}
    {additional.length > 0 && <section className={styles.additionalRoutes} aria-label={local(locale, "Additional route information", "ข้อมูลเส้นทางเพิ่มเติม")}><h2>{local(locale, "More connections", "การเชื่อมต่อเพิ่มเติม")}</h2><div className={styles.grid}>{additional.map((item) => <article className={styles.card} key={item.id}><div className={styles.cardImage}><Image src={item.image} alt={local(locale, item.title, item.titleTh)} fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 33vw" /></div><div className={styles.newsBody}><h3>{local(locale, item.title, item.titleTh)}</h3><p>{local(locale, item.description, item.descriptionTh)}</p><Action locale={locale} to={`contact?subject=${encodeURIComponent(local(locale, item.title, item.titleTh))}`} secondary>{local(locale, "Enquire about this route", "สอบถามเส้นทางนี้")}</Action></div></article>)}</div></section>}
  </div>;
}
type ContactValues = { name: string; email: string; company: string; subject: string; message: string; consent: boolean };
const blankContact: ContactValues = { name: "", email: "", company: "", subject: "", message: "", consent: false };

function subscribeContact(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("popstate", listener); };
}

function contactSnapshot() {
  let draft: ContactValues = { ...blankContact };
  try { const stored = localStorage.getItem("moe-contact-draft"); if (stored) { const parsed: unknown = JSON.parse(stored); if (parsed && typeof parsed === "object") { const record = parsed as Record<string, unknown>; for (const field of ["name", "email", "company", "subject", "message"] as const) { if (typeof record[field] === "string") draft[field] = record[field].slice(0, field === "message" ? 5000 : 200); } } } } catch { /* A draft is optional when browser storage is unavailable. */ }
  const subject = new URLSearchParams(window.location.search).get("subject");
  if (subject) draft = { ...draft, subject: subject.slice(0, 200) };
  return JSON.stringify(draft);
}

function Contact({ locale }: { locale: Locale }) {
  const snapshot = useSyncExternalStore(subscribeContact, contactSnapshot, () => JSON.stringify(blankContact));
  const [edited, setValues] = useState<ContactValues | null>(null);
  const values: ContactValues = edited || JSON.parse(snapshot);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactValues | "storage", string>>>({});
  const [saved, setSaved] = useState(false);
  const invalidFocusRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!invalidFocusRef.current) return;
    document.getElementById(`contact-${invalidFocusRef.current}`)?.focus();
    invalidFocusRef.current = null;
  }, [errors]);
  const update = (field: keyof ContactValues, value: string | boolean) => { setValues((current) => ({ ...(current || values), [field]: value })); setSaved(false); setErrors((current) => ({ ...current, [field]: undefined, storage: undefined })); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!values.name.trim()) next.name = local(locale, "Please enter your name.", "กรุณากรอกชื่อ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = local(locale, "Please enter a valid email address.", "กรุณากรอกอีเมลที่ถูกต้อง");
    if (!values.subject.trim()) next.subject = local(locale, "Please enter a subject.", "กรุณากรอกหัวข้อ");
    if (!values.message.trim()) next.message = local(locale, "Please tell us about your requirements.", "กรุณาระบุความต้องการของคุณ");
    if (!values.consent) next.consent = local(locale, "Please confirm local demo storage.", "กรุณายืนยันการบันทึกตัวอย่างในเบราว์เซอร์");
    if (Object.keys(next).length) { invalidFocusRef.current = Object.keys(next)[0]; setErrors(next); return; }
    try { localStorage.setItem("moe-contact-draft", JSON.stringify({ ...values, consent: false })); setErrors({}); setSaved(true); } catch { setSaved(false); setErrors({ storage: local(locale, "Your browser could not save the draft. Your text is still here; enable browser storage and try again.", "เบราว์เซอร์ไม่สามารถบันทึกฉบับร่างได้ ข้อความยังอยู่ กรุณาเปิดใช้งานที่เก็บข้อมูลเบราว์เซอร์แล้วลองอีกครั้ง") }); }
  };
  const clear = () => { try { localStorage.removeItem("moe-contact-draft"); setValues(blankContact); setErrors({}); setSaved(false); } catch { setErrors({ storage: local(locale, "Your browser could not clear the saved draft. Please clear site data in browser settings.", "ไม่สามารถลบฉบับร่างได้ กรุณาลบข้อมูลเว็บไซต์ในการตั้งค่าเบราว์เซอร์") }); } };
  const fields = [{ id: "name", label: local(locale, "Name", "ชื่อ"), auto: "name", required: true }, { id: "email", label: local(locale, "Email", "อีเมล"), auto: "email", required: true }, { id: "company", label: local(locale, "Company (optional)", "บริษัท (ไม่บังคับ)"), auto: "organization", required: false }, { id: "subject", label: local(locale, "Subject", "หัวข้อ"), auto: "off", required: true }] as const;
  return <div className="container section"><Heading eyebrow={local(locale, "GET IN TOUCH", "พูดคุยกับเรา")} title={local(locale, "Contact us", "ติดต่อเรา")} description={local(locale, "Let’s discuss your next maritime operation.", "พูดคุยเกี่ยวกับงานทางทะเลครั้งต่อไปของคุณ")} /><div className={styles.contactLayout}><div className={styles.contactIntro}><div className={styles.contactPhoto}><Image src="/images/consulting.webp" alt={local(locale, "Illustrative maritime planning team", "ภาพประกอบทีมวางแผนงานทางทะเล")} fill sizes="(max-width: 850px) 100vw, 45vw" /></div><h2>MOE NAVIGATION</h2><p>{local(locale, "Tell us about your vessel, cargo, route or project. The demo form lets you prepare an enquiry before live contact channels are connected.", "บอกเราเกี่ยวกับเรือ สินค้า เส้นทาง หรือโครงการของคุณ แบบฟอร์มตัวอย่างนี้ช่วยเตรียมข้อความสอบถาม ก่อนเชื่อมต่อช่องทางติดต่อจริง")}</p><div className={styles.contactInfo}><span><MapPin size={22} aria-hidden="true" />{local(locale, "Office details will be added after confirmation.", "รายละเอียดสำนักงานจะเพิ่มเติมหลังได้รับการยืนยัน")}</span><span><Waves size={22} aria-hidden="true" />{local(locale, "Phone, email and office map are coming with the live setup.", "โทรศัพท์ อีเมล และแผนที่สำนักงานจะเพิ่มเมื่อเปิดใช้งานจริง")}</span></div><p className="notice">{local(locale, "Demo mode: no message is emailed or sent. A submitted draft is stored only in this browser.", "โหมดตัวอย่าง: ไม่มีการส่งข้อความหรืออีเมล ฉบับร่างที่บันทึกจะอยู่ในเบราว์เซอร์นี้เท่านั้น")}</p></div><form className={styles.contactForm} onSubmit={submit} noValidate><h2>{local(locale, "Prepare your enquiry", "เตรียมข้อความสอบถาม")}</h2><p className={styles.formNote}>{local(locale, "Demo only — this saves a draft in your browser and sends nothing.", "โหมดตัวอย่าง — บันทึกฉบับร่างในเบราว์เซอร์เท่านั้น ไม่มีการส่งข้อความ")}</p>{Object.keys(errors).some((key) => key !== "storage") && <p className={styles.error} role="alert">{local(locale, "Please correct the highlighted fields before saving.", "กรุณาแก้ไขช่องที่ทำเครื่องหมายก่อนบันทึก")}</p>}<div className={styles.formGrid}>{fields.map((field) => <div className={`field ${(field.id === "subject" || field.id === "company") ? styles.fullField : ""}`} key={field.id}><label htmlFor={`contact-${field.id}`}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label><input id={`contact-${field.id}`} name={field.id} type={field.id === "email" ? "email" : "text"} autoComplete={field.auto} value={values[field.id]} onChange={(event) => update(field.id, event.target.value)} maxLength={200} required={field.required} aria-invalid={!!errors[field.id]} aria-describedby={errors[field.id] ? `error-${field.id}` : undefined} />{errors[field.id] && <p className={styles.error} id={`error-${field.id}`}>{errors[field.id]}</p>}</div>)}<div className={`field ${styles.fullField}`}><label htmlFor="contact-message">{local(locale, "Message", "ข้อความ")} <span aria-hidden="true">*</span></label><textarea id="contact-message" name="message" rows={6} value={values.message} onChange={(event) => update("message", event.target.value)} maxLength={5000} required aria-invalid={!!errors.message} aria-describedby={errors.message ? "error-message" : undefined} placeholder={local(locale, "Tell us about the scope, location and preferred timing…", "ระบุขอบเขตงาน พื้นที่ และช่วงเวลาที่ต้องการ…")} />{errors.message && <p className={styles.error} id="error-message">{errors.message}</p>}</div></div><label className={styles.consent}><input id="contact-consent" type="checkbox" checked={values.consent} onChange={(event) => update("consent", event.target.checked)} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "error-consent" : undefined} /><span>{local(locale, "I understand this demo saves my draft in this browser only.", "ฉันเข้าใจว่าตัวอย่างนี้บันทึกฉบับร่างในเบราว์เซอร์นี้เท่านั้น")} <Link href={href(locale, "privacy")}>{local(locale, "Privacy information", "ข้อมูลความเป็นส่วนตัว")}</Link></span></label>{errors.consent && <p className={styles.error} id="error-consent">{errors.consent}</p>}{errors.storage && <p className={styles.error} role="alert">{errors.storage}</p>}<div className={styles.formActions}><button className="button" type="submit">{local(locale, "Save enquiry draft", "บันทึกฉบับร่าง")}<ArrowRight size={19} aria-hidden="true" /></button><button className={styles.clearDraft} type="button" onClick={clear}>{local(locale, "Clear draft", "ลบฉบับร่าง")}</button></div>{saved && <div className={styles.success} role="status"><Check size={24} aria-hidden="true" /><div><strong>{local(locale, "Your draft is saved in this browser.", "บันทึกฉบับร่างในเบราว์เซอร์นี้แล้ว")}</strong><p>{local(locale, "Nothing has been emailed or sent. You can return to edit it or clear it above.", "ไม่มีการส่งข้อความหรืออีเมล คุณสามารถกลับมาแก้ไขหรือลบได้")}</p></div></div>}</form></div></div>;
}

function Privacy({ locale }: { locale: Locale }) {
  const sections = [
    [local(locale, "About this demo", "เกี่ยวกับเว็บไซต์ตัวอย่างนี้"), local(locale, "This website is a demonstration of the MOE NAVIGATION experience. Live company contact details, API services and a final privacy policy will be supplied before production use.", "เว็บไซต์นี้เป็นตัวอย่างการใช้งานสำหรับ MOE NAVIGATION ข้อมูลติดต่อบริษัท บริการ API และนโยบายความเป็นส่วนตัวฉบับจริงจะจัดเตรียมก่อนเปิดใช้งานจริง")],
    [local(locale, "Contact form drafts", "ฉบับร่างจากแบบฟอร์มติดต่อ"), local(locale, "When you select Save enquiry draft, your name, email, optional company, subject and message are stored in local storage on this browser. The demo does not email this information or submit it to a contact API. Avoid entering sensitive information on a shared device.", "เมื่อเลือกบันทึกฉบับร่าง ชื่อ อีเมล บริษัท (หากระบุ) หัวข้อ และข้อความจะถูกบันทึกในที่เก็บข้อมูลของเบราว์เซอร์นี้ ตัวอย่างนี้ไม่ส่งข้อมูลทางอีเมลหรือ API ติดต่อ กรุณาหลีกเลี่ยงข้อมูลละเอียดอ่อนบนอุปกรณ์ที่ใช้ร่วมกัน")],
    [local(locale, "Your control", "การจัดการข้อมูลของคุณ"), local(locale, "Use Clear draft on the contact page to remove the saved enquiry. You can also remove it by clearing this site’s data in your browser settings. Drafts are not automatically synchronized across devices.", "เลือก ลบฉบับร่าง ในหน้าติดต่อเพื่อลบข้อความที่บันทึก หรือใช้การลบข้อมูลเว็บไซต์ในการตั้งค่าเบราว์เซอร์ ฉบับร่างไม่ซิงก์ระหว่างอุปกรณ์โดยอัตโนมัติ")],
    [local(locale, "Demo content management", "การจัดการเนื้อหาตัวอย่าง"), local(locale, "The demo content manager stores edits locally in this browser. It is intended for testing the content workflow. Production access control, database storage and media integrations are not connected.", "ระบบจัดการเนื้อหาตัวอย่างบันทึกการแก้ไขไว้ในเบราว์เซอร์นี้ เพื่อทดสอบขั้นตอนการทำงาน ยังไม่ได้เชื่อมต่อการควบคุมสิทธิ์สำหรับระบบจริง ฐานข้อมูล หรือบริการจัดเก็บรูปภาพ")],
    [local(locale, "Imagery and published information", "ภาพและข้อมูลที่นำเสนอ"), local(locale, "Generated images are illustrative. Demo vessels, projects, articles and approximate map connections should not be taken as verified business records, vessel specifications or navigation guidance.", "ภาพที่สร้างขึ้นใช้เพื่อประกอบการนำเสนอ เรือ โครงการ บทความ และเส้นทางเชื่อมต่อบนแผนที่โดยประมาณไม่ใช่ข้อมูลธุรกิจที่ได้รับการยืนยัน ข้อมูลทางเทคนิคเรือ หรือข้อมูลสำหรับการนำทาง")],
    [local(locale, "Before launch", "ก่อนเปิดใช้งานจริง"), local(locale, "The live policy must identify the responsible organization, purposes of processing, retention periods, service providers and contact channels. It will be reviewed when the actual integrations and company details are available.", "นโยบายฉบับจริงต้องระบุองค์กรที่รับผิดชอบ วัตถุประสงค์การประมวลผล ระยะเวลาเก็บข้อมูล ผู้ให้บริการ และช่องทางติดต่อ โดยจะทบทวนเมื่อมีข้อมูลบริษัทและการเชื่อมต่อบริการจริง")],
  ];
  return <div className="container section"><Heading eyebrow={local(locale, "YOUR INFORMATION", "ข้อมูลของคุณ")} title={local(locale, "Privacy information", "ข้อมูลความเป็นส่วนตัว")} description={local(locale, "A clear explanation of how this demo handles your information.", "คำอธิบายการจัดการข้อมูลในเว็บไซต์ตัวอย่างนี้")} /><div className={styles.privacy}><p className="notice">{local(locale, "Demo notice — the production privacy policy is pending company review.", "ประกาศสำหรับตัวอย่าง — นโยบายฉบับจริงรอการตรวจสอบจากบริษัท")}</p>{sections.map(([title, text], index) => <section key={title}><h2>{index + 1}. {title}</h2><p>{text}</p></section>)}<Action locale={locale} secondary>{local(locale, "Back to contact", "กลับไปหน้าติดต่อ")}</Action></div></div>;
}

function MissingEntry({ locale, page }: { locale: Locale; page: string }) {
  return <div className="container section"><div className={styles.empty}><Anchor size={38} aria-hidden="true" /><h1>{local(locale, "This item is not available", "ไม่พบรายการนี้")}</h1><p>{local(locale, "It may have been removed from the demo collection.", "รายการนี้อาจถูกนำออกจากคอลเลกชันตัวอย่างแล้ว")}</p><Action locale={locale} to={page}>{local(locale, "Return to the collection", "กลับไปยังคอลเลกชัน")}</Action></div></div>;
}

export function ContentPage({ locale, page, slug }: PageProps) {
  if (page === "about") return <About locale={locale} />;
  if (page === "services") return <Services locale={locale} slug={slug} />;
  if (page === "fleet") return <Fleet locale={locale} slug={slug} />;
  if (page === "routes") return <Routes locale={locale} />;
  if (page === "projects" || page === "news") return <Articles locale={locale} page={page} slug={slug} />;
  if (page === "contact") return <Contact locale={locale} />;
  if (page === "privacy") return <Privacy locale={locale} />;
  return <MissingEntry locale={locale} page="" />;
}






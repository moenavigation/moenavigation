"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import { AdditionalSections, ContentBody } from "./EditorialContent";
import styles from "./ContentPages.module.css";

export default function PrivacyPage({ locale }: { locale: Locale }) {
  const { settings, pages, sections } = usePublicContent();
  const page = pages.find((entry) => entry.id === "privacy");
  const privacySections = sections.filter((entry) => entry.parentId === "privacy");
  return <div className="container section">
    <div className={styles.heading}><div><p className="eyebrow">{contentText(page,"eyebrow",locale)}</p><h1>{contentText(page,"title",locale)}</h1><p className={styles.lead}>{contentText(page,"description",locale)}</p></div></div>
    <div className={styles.privacy}><p className="notice">{local(locale,"This notice describes the current website. Responsible company details and the final policy are awaiting company confirmation.","ประกาศนี้อธิบายการทำงานปัจจุบันของเว็บไซต์ รายละเอียดบริษัทผู้รับผิดชอบและนโยบายฉบับสมบูรณ์ยังรอการยืนยันจากบริษัท")}</p>
      {privacySections.length > 1 && <details className={styles.privacyIndex}><summary>{local(locale,"On this page","หัวข้อในหน้านี้")}<ChevronDown size={20} aria-hidden="true" /></summary><nav aria-label={local(locale,"Privacy topics","หัวข้อข้อมูลความเป็นส่วนตัว")}>{privacySections.map(section => <a key={section.id} href={`#section-${section.id}`}>{contentText(section,"title",locale)}</a>)}</nav></details>}
      <ContentBody text={contentText(page,"body",locale)} /><AdditionalSections pageId="privacy" locale={locale} />
      {settings.email && <section><h2>{local(locale,"Contact about your information","ติดต่อเกี่ยวกับข้อมูลของคุณ")}</h2><p>{local(locale,"You can contact the website team at","คุณสามารถติดต่อทีมงานเว็บไซต์ได้ที่")} <a href={`mailto:${settings.email}`}>{settings.email}</a>.</p></section>}
      <Link className="button secondary" href={href(locale,"contact")}>{local(locale,"Back to contact","กลับไปหน้าติดต่อ")}<ArrowRight size={20} aria-hidden="true" /></Link>
    </div>
  </div>;
}

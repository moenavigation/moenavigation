"use client";

import Image from "next/image";
import type { Locale } from "@/lib/content";
import { contentText } from "@/lib/public-content";
import { usePublicContent } from "@/lib/use-public-content";
import styles from "./ContentPages.module.css";

export function ContentBody({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return <div className={styles.contentBody}>{text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}

export function AdditionalSections({ pageId, locale, exclude = [] }: { pageId: string; locale: Locale; exclude?: string[] }) {
  const { sections } = usePublicContent();
  const additional = sections.filter((section) => section.parentId === pageId && !exclude.includes(section.id));
  if (!additional.length) return null;
  return <div className={styles.editorialSections}>{additional.map((section) => <section id={`section-${section.id}`} key={section.id}>
    {section.image && <div className={styles.editorialPhoto}><Image src={section.image} alt={contentText(section,"imageAlt",locale) || contentText(section,"title",locale)} fill sizes="(max-width: 760px) 100vw, 70vw" /></div>}
    {contentText(section,"eyebrow",locale) && <p className="eyebrow">{contentText(section,"eyebrow",locale)}</p>}
    <h2>{contentText(section,"title",locale)}</h2>
    {contentText(section,"description",locale) && <p>{contentText(section,"description",locale)}</p>}
    <ContentBody text={contentText(section,"body",locale)} />
  </section>)}</div>;
}

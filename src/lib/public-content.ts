import type { ContentRecord } from "./cms-types";
import type { Locale } from "./content";

type TextField = "title" | "description" | "body" | "eyebrow" | "bodyHeading" | "imageAlt" | "category" | "caption";
export function contentText(record: ContentRecord | undefined, field: TextField, locale: Locale) {
  const key: TextField | `${TextField}Th` = locale === "th" ? `${field}Th` : field;
  return record?.[key] || "";
}

export function projectPublicContent(records: ContentRecord[]) {
  const visible = (type: ContentRecord["type"]) => records.filter((record) => record.type === type && record.status === "Published" && !record.deletedAt).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  const bilingual = (record: ContentRecord) => ({
    title: { en: record.title, th: record.titleTh },
    description: { en: record.description, th: record.descriptionTh },
    body: { en: record.body || "", th: record.bodyTh || "" },
    imageAlt: { en: record.imageAlt || "", th: record.imageAltTh || "" },
    bodyHeading: { en: record.bodyHeading || "", th: record.bodyHeadingTh || "" },
  });

  return {
    services: visible("Service").map((record) => ({ id: record.id, ...bilingual(record), image: record.image, icon: record.icon || "Ship" })),
    vessels: visible("Vessel").map((record) => ({ id: record.id, ...bilingual(record), name: record.title, nameTh: record.titleTh, type: record.category, typeTh: record.categoryTh, image: record.image, gallery: record.gallery || [], specs: record.vesselSpecs })),
    projects: visible("Project").map((record) => ({ id: record.id, ...bilingual(record), image: record.image, category: record.category, categoryTh: record.categoryTh, date: record.date })),
    news: visible("News").map((record) => ({ id: record.id, ...bilingual(record), image: record.image, category: record.category, categoryTh: record.categoryTh, date: record.date || undefined })),
    pages: visible("Page"),
    routes: visible("Route"),
    sections: visible("Section"),
  };
}

export type PublicContent = ReturnType<typeof projectPublicContent>;

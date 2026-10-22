import type { MetadataRoute } from "next";
import { href, navigation, type Locale } from "@/lib/content";
import { getPublishedRecords } from "@/server/content";
import { siteOrigin } from '@/lib/site-config';

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin();
  const records = await getPublishedRecords();
  const paths = new Map<string, string | undefined>([...navigation.map((entry) => [entry.id, undefined] as const), ["contact", undefined], ["privacy", undefined]]);
  const collectionPaths: Record<string, string> = { Service: "services", Vessel: "fleet", Project: "projects", News: "news" };
  for (const record of records) {
    if (record.type === "Page") paths.set(record.id === "home" ? "" : record.id, record.updatedAt);
    else if (collectionPaths[record.type]) paths.set(`${collectionPaths[record.type]}/${record.id}`, record.updatedAt);
  }
  return [...paths].flatMap(([path, updatedAt]) => (["th", "en"] as Locale[]).map((locale) => ({
    url: new URL(href(locale, path), base).href,
    ...(updatedAt ? { lastModified: updatedAt } : {}),
    alternates: { languages: { th: new URL(href("th", path), base).href, en: new URL(href("en", path), base).href } },
  })));
}

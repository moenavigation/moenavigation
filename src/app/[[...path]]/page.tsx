import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import Home from "@/components/Home";
import { ContentPage } from "@/components/ContentPages";
import CmsDemo from "@/components/CmsDemo";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord } from "@/lib/cms-types";
import { PublicContentProvider } from "@/lib/public-content-provider";
import { getPublishedRecords } from "@/server/content";
import { getSiteSettings } from "@/server/settings";
import { indexingEnabled, siteOrigin } from '@/lib/site-config';
import { idSchema } from '@/lib/validation';

export const dynamic = "force-dynamic";

const getRecords = cache(getPublishedRecords);

const detailTypes: Record<string, ContentRecord["type"]> = { services: "Service", fleet: "Vessel", projects: "Project", news: "News" };
function resolve(path: string[] = []) {
  const locale: Locale = path[0] === "en" ? "en" : "th";
  const pieces = locale === "en" ? path.slice(1) : path;
  return { locale, pieces, page: pieces[0] || "", slug: pieces[1] };
}

function findRecord(records: ContentRecord[], page: string, slug?: string) {
  return slug
    ? records.find((record) => record.type === detailTypes[page] && record.id === slug)
    : records.find((record) => record.type === "Page" && record.id === (page || "home"));
}

function validatePath(pieces: string[], page: string, slug?: string) {
  // Asset filenames and invalid CMS slugs cannot match content; reject them before querying MongoDB.
  if (pieces.length > 2 || (slug && !detailTypes[page]) || pieces.some(piece => !idSchema.safeParse(piece).success)) notFound();
}

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }): Promise<Metadata> {
  const { path = [] } = await params;
  const { locale, page, slug, pieces } = resolve(path);
  if (page === "cms" && pieces.length === 1) return { title: "MOE Navigation · Content management", robots: { index: false, follow: false } };
  validatePath(pieces, page, slug);
  const [records, settings] = await Promise.all([getRecords(), getSiteSettings()]);
  const item = findRecord(records, page, slug);
  if (!item) notFound();
  const title = local(locale, item.title, item.titleTh);
  const description = local(locale, item.description, item.descriptionTh);
  const pathPart = pieces.join("/");
  const company = local(locale, settings.companyName, settings.companyNameTh);
  const siteUrl = siteOrigin();
  const images = item.image ? [{ url: item.image, alt: local(locale, item.imageAlt || item.title, item.imageAltTh || item.titleTh) }] : [];
  return {
    metadataBase: new URL(siteUrl),
    title: `${title} | ${company}`,
    description,
    robots: { index: indexingEnabled(), follow: indexingEnabled() },
    alternates: { canonical: href(locale, pathPart), languages: { th: href("th", pathPart), en: href("en", pathPart), "x-default": href("th", pathPart) } },
    openGraph: { title: `${title} | ${company}`, description, url: new URL(href(locale, pathPart), siteUrl).href, siteName: company, locale: locale === "en" ? "en_US" : "th_TH", alternateLocale: locale === 'en' ? 'th_TH' : 'en_US', images, type: item.type === 'News' ? 'article' : 'website' },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title: `${title} | ${company}`, description, images },
  };
}

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const { locale, page, slug, pieces } = resolve(path);
  if (page === "cms" && pieces.length === 1) {
    if (locale === "en") redirect("/cms");
    return <CmsDemo />;
  }
  validatePath(pieces, page, slug);
  if (page === "home") redirect(href(locale));
  const [records, settings] = await Promise.all([getRecords(), getSiteSettings()]);
  const item = findRecord(records, page, slug);
  if (!item) notFound();
  const organization = !page && indexingEnabled() ? {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: local(locale, settings.companyName, settings.companyNameTh), url: siteOrigin(),
    ...(settings.phone ? { telephone: settings.phone } : {}), ...(settings.email ? { email: settings.email } : {}),
    ...(local(locale, settings.officeAddress, settings.officeAddressTh) ? { address: local(locale, settings.officeAddress, settings.officeAddressTh) } : {}),
  } : null;
  return <PublicContentProvider records={records} settings={settings}>{organization && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, '\\u003c') }} />}<SiteShell locale={locale}>{page ? <ContentPage key={`${locale}/${pieces.join("/")}`} locale={locale} page={page} slug={slug} /> : <Home locale={locale} />}</SiteShell></PublicContentProvider>;
}

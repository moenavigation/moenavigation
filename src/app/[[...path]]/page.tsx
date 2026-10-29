import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import SiteShell, { SiteHeader } from "@/components/SiteShell";
import Home from "@/components/Home";
import { ContentPage } from "@/components/ContentPages";
import LoadingScreen from "@/components/LoadingScreen";
import { href, local, type Locale } from "@/lib/content";
import type { ContentRecord } from "@/lib/cms-types";
import { PublicContentProvider } from "@/lib/public-content-provider";
import { getPublicRecord, getPublicRecords, getPublicSettings } from "@/server/public-data";
import { selectPublicPageRecords } from '@/lib/public-page-content';
import { PublicSearchParamsProvider } from '@/lib/use-public-search-params';
import { indexingEnabled, siteOrigin } from '@/lib/site-config';
import { idSchema } from '@/lib/validation';
import { companyNameEn } from '@/lib/company';

export const revalidate = 86400;
// Generate public URLs on first visit, then reuse their rendered output. New
// CMS pages work without a rebuild, including URLs previously cached as 404s.
export function generateStaticParams() { return []; }

const detailTypes: Record<string, ContentRecord["type"]> = { services: "Service", fleet: "Vessel", projects: "Project", news: "News" };
function resolve(path: string[] = []) {
  const locale: Locale = path[0] === "th" ? "th" : "en";
  const pieces = path[0] === "th" || path[0] === "en" ? path.slice(1) : path;
  return { locale, pieces, page: pieces[0] || "", slug: pieces[1] };
}

function getRouteRecord(page: string, slug?: string) {
  return getPublicRecord(slug ? detailTypes[page] : 'Page', slug || page || 'home');
}

function validatePath(pieces: string[], page: string, slug?: string) {
  // Asset filenames and invalid CMS slugs cannot match content; reject them before querying MongoDB.
  if (pieces.length > 2 || (slug && !detailTypes[page]) || pieces.some(piece => !idSchema.safeParse(piece).success)) notFound();
}

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }): Promise<Metadata> {
  const { path = [] } = await params;
  const { locale, page, slug, pieces } = resolve(path);
  if (page === "cms" && pieces.length === 1) return { title: `${companyNameEn} · จัดการเนื้อหา`, robots: { index: false, follow: false } };
  validatePath(pieces, page, slug);
  const item = await getRouteRecord(page, slug);
  if (!item) notFound();
  const settings = await getPublicSettings();
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
    alternates: { canonical: href(locale, pathPart), languages: { th: href("th", pathPart), en: href("en", pathPart), "x-default": href("en", pathPart) } },
    openGraph: { title: `${title} | ${company}`, description, url: new URL(href(locale, pathPart), siteUrl).href, siteName: company, locale: locale === "en" ? "en_US" : "th_TH", alternateLocale: locale === 'en' ? 'th_TH' : 'en_US', images, type: item.type === 'News' ? 'article' : 'website' },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title: `${title} | ${company}`, description, images },
  };
}

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const { locale, page, slug, pieces } = resolve(path);
  if (page === "cms" && pieces.length === 1) {
    redirect("/cms");
  }
  validatePath(pieces, page, slug);
  if (page === "home") redirect(href(locale));
  const item = await getRouteRecord(page, slug);
  if (!item) notFound();
  // Validate the URL before the fallback can send response headers. The rest
  // of the page can then stream without turning deleted content into soft 404s.
  return <PublicSearchParamsProvider><Suspense key={`${locale}/${pieces.join('/')}`} fallback={<><SiteHeader locale={locale} /><main id="main" tabIndex={-1}><LoadingScreen locale={locale} /></main></>}><PublicPage locale={locale} page={page} slug={slug} pieces={pieces} /></Suspense></PublicSearchParamsProvider>;
}

async function PublicPage({ locale, page, slug, pieces }: { locale: Locale; page: string; slug?: string; pieces: string[] }) {
  const [published, settings] = await Promise.all([getPublicRecords(), getPublicSettings()]);
  const records = selectPublicPageRecords(published, page, slug);
  // A record can be trashed while the remaining data is loading. Still use the
  // framework's noindex recovery page if it disappeared after the route check.
  if (!records.some(record => record.type === (slug ? detailTypes[page] : 'Page') && record.id === (slug || page || 'home'))) notFound();
  const organization = !page && indexingEnabled() ? {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: local(locale, settings.companyName, settings.companyNameTh), url: siteOrigin(),
    ...(settings.phone ? { telephone: settings.phone } : {}), ...(settings.email ? { email: settings.email } : {}),
    ...(local(locale, settings.officeAddress, settings.officeAddressTh) ? { address: local(locale, settings.officeAddress, settings.officeAddressTh) } : {}),
  } : null;
  return <PublicContentProvider records={records} settings={settings}>{organization && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, '\\u003c') }} />}<SiteShell locale={locale}>{page ? <ContentPage key={`${locale}/${pieces.join("/")}`} locale={locale} page={page} slug={slug} /> : <Home locale={locale} />}</SiteShell></PublicContentProvider>;
}

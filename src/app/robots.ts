import type { MetadataRoute } from "next";
import { indexingEnabled, siteOrigin } from '@/lib/site-config';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: ['/cms', '/th/cms', '/en/cms', '/api/'] }, sitemap: `${siteOrigin()}/sitemap.xml` };
}

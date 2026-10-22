import type { MetadataRoute } from "next";
import {navigation,href} from "@/lib/content";
export default function sitemap():MetadataRoute.Sitemap { const base=process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3005";return [...navigation.map(n=>n.id),"contact","privacy"].flatMap(path=>["th","en"].map(lang=>({url:new URL(href(lang as "th"|"en",path),base).href,alternates:{languages:{th:new URL(href("th",path),base).href,en:new URL(href("en",path),base).href}}}))); }

export type Locale = "th" | "en";
export type Bilingual = { en: string; th: string };
export function local(locale: Locale, en: string, th: string) { return locale === "en" ? en : th; }
export function href(locale: Locale, path = "") { return `${locale === "en" ? "/en" : ""}${path ? `/${path.replace(/^\/+/, "")}` : ""}` || "/"; }
export const navigation = [
  { id: "", title: { en: "Home", th: "หน้าหลัก" } },
  { id: "about", title: { en: "About us", th: "เกี่ยวกับเรา" } },
  { id: "services", title: { en: "Services", th: "บริการ" } },
  { id: "fleet", title: { en: "Fleet", th: "กองเรือ" } },
  { id: "routes", title: { en: "Routes", th: "เส้นทาง" } },
  { id: "projects", title: { en: "Projects", th: "โครงการ" } },
  { id: "news", title: { en: "News", th: "ข่าวสาร" } },
];

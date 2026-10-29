export type Locale = "th" | "en";
export type Bilingual = { en: string; th: string };
export function local(locale: Locale, en: string, th: string) { return locale === "en" ? en : th; }
export function href(locale: Locale, path = "") { return `${locale === "th" ? "/th" : ""}${path ? `/${path.replace(/^\/+/, "")}` : ""}` || "/"; }
export function localeFromPathname(pathname: string): Locale { return pathname === "/th" || pathname.startsWith("/th/") ? "th" : "en"; }
export function pathWithoutLocale(pathname: string) { return pathname.replace(/^\/(?:th|en)(?=\/|$)/, "").replace(/^\/+/, ""); }
export const navigation = [
  { id: "", title: { en: "Home", th: "หน้าแรก" } },
  { id: "about", title: { en: "About us", th: "เกี่ยวกับเรา" } },
  { id: "services", title: { en: "Services", th: "บริการ" } },
  { id: "fleet", title: { en: "Fleet", th: "กองเรือ" } },
  { id: "routes", title: { en: "Routes", th: "เส้นทาง" } },
];

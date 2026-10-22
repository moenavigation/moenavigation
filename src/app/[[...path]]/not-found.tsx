"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import { href, local, type Locale } from "@/lib/content";

export default function NotFound() {
  const pathname = usePathname();
  const locale: Locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "th";

  return (
    <SiteShell locale={locale}>
      <section className="container section" style={{ minHeight: "65vh", display: "grid", alignContent: "center" }}>
        <div style={{ display: "grid", gap: "1.25rem", maxWidth: "40rem" }}>
          <span className="eyebrow" style={{ marginBottom: 0 }}>404 · MOE Navigation</span>
          <h1>{local(locale, "Page not found", "ไม่พบหน้านี้")}</h1>
          <p>{local(locale, "The address may be incorrect, or this page may have moved. You can return home or explore our services.", "ที่อยู่อาจไม่ถูกต้อง หรือหน้านี้อาจถูกย้าย คุณสามารถกลับไปยังหน้าหลักหรือสำรวจบริการของเรา")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: ".5rem" }}>
            <Link className="button" href={href(locale)}>{local(locale, "Return home", "กลับหน้าหลัก")}</Link>
            <Link className="button secondary" href={href(locale, "services")}>{local(locale, "Explore services", "สำรวจบริการ")}</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

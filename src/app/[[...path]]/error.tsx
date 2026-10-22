"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { href, local, type Locale } from "@/lib/content";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const pathname = usePathname();
  const locale: Locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "th";

  return (
    <main className="container section" style={{ minHeight: "75vh", display: "grid", alignContent: "center" }}>
      <div style={{ display: "grid", gap: "1.25rem", maxWidth: "40rem" }}>
        <span className="eyebrow" style={{ marginBottom: 0 }}>MOE Navigation</span>
        <h1>{local(locale, "We couldn't load this page", "ไม่สามารถโหลดหน้านี้ได้")}</h1>
        <p>{local(locale, "Please try again. If the problem continues, return to the home page and continue exploring.", "โปรดลองอีกครั้ง หากยังพบปัญหา สามารถกลับไปยังหน้าหลักเพื่อดูข้อมูลต่อได้")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: ".5rem" }}>
          <button type="button" className="button" onClick={retry}>{local(locale, "Try again", "ลองอีกครั้ง")}</button>
          <Link className="button secondary" href={href(locale)}>{local(locale, "Return home", "กลับหน้าหลัก")}</Link>
        </div>
      </div>
    </main>
  );
}

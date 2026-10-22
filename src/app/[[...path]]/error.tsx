"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, RotateCcw, LifeBuoy } from "lucide-react";
import { href, local, type Locale } from "@/lib/content";
import styles from "@/components/RecoveryPage.module.css";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const pathname = usePathname();
  const locale: Locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "th";

  return (
    <main className={`container section ${styles.screen}`}>
      <title>{`${local(locale, "Please try again", "โปรดลองอีกครั้ง")} | MOE Navigation`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className={styles.card}>
        <div className={styles.badge}><LifeBuoy aria-hidden="true" /></div>
        <span className="eyebrow">MOE Navigation</span>
        <h1>{local(locale, "We couldn't load this page", "ไม่สามารถโหลดหน้านี้ได้")}</h1>
        <p className={styles.description}>{local(locale, "Please try again. If the problem continues, return to the home page and continue exploring.", "โปรดลองอีกครั้ง หากยังพบปัญหา สามารถกลับไปยังหน้าหลักเพื่อดูข้อมูลต่อได้")}</p>
        <div className={styles.actions}>
          <button type="button" className="button" onClick={retry}><RotateCcw size={20} aria-hidden="true" />{local(locale, "Try again", "ลองอีกครั้ง")}</button>
          <Link className="button secondary" href={href(locale)}><ArrowLeft size={20} aria-hidden="true" />{local(locale, "Return home", "กลับหน้าหลัก")}</Link>
        </div>
      </div>
    </main>
  );
}

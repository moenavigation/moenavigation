"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import { href, local, localeFromPathname } from "@/lib/content";
import styles from "@/components/RecoveryPage.module.css";

export default function NotFound() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);

  return (
    <main className={`container section ${styles.screen}`}>
        <title>{`${local(locale, "Page not found", "ไม่พบหน้านี้")} | MOE Navigation`}</title>
        <div className={styles.card}>
          <div className={styles.badge}><Compass aria-hidden="true" /></div>
          <span className="eyebrow">404 · MOE Navigation</span>
          <h1>{local(locale, "Page not found", "ไม่พบหน้านี้")}</h1>
          <p className={styles.description}>{local(locale, "The address may be incorrect, or this page may have moved. You can return home or explore our services.", "ลิงก์อาจไม่ถูกต้อง หรือหน้านี้อาจถูกย้ายไปแล้ว คุณสามารถกลับไปยังหน้าแรกหรือดูบริการของเราได้")}</p>
          <div className={styles.actions}>
            <Link className="button" href={href(locale)}><ArrowLeft size={20} aria-hidden="true" />{local(locale, "Return home", "กลับหน้าแรก")}</Link>
            <Link className="button secondary" href={href(locale, "services")}>{local(locale, "Explore services", "ดูบริการของเรา")}<ArrowRight size={20} aria-hidden="true" /></Link>
          </div>
        </div>
    </main>
  );
}

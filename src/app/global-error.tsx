'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Recovering a failed root layout needs a fresh document load. */

import './globals.css';
import { LifeBuoy, RotateCcw } from 'lucide-react';
import styles from '@/components/RecoveryPage.module.css';

export default function GlobalError({ retry }: { retry: () => void }) {
  return <html lang="th"><head><title>MOE Navigation · Please try again</title><meta name="robots" content="noindex" /></head><body className={styles.globalBody}><main className={`container section ${styles.screen} ${styles.globalScreen}`}><div className={styles.card}>
    <div className={styles.badge}><LifeBuoy aria-hidden="true" /></div>
    <span className="eyebrow">MOE Navigation</span>
    <h1>ไม่สามารถโหลดเว็บไซต์ได้</h1>
    <p className={styles.description}>โปรดลองอีกครั้ง หรือกลับไปยังหน้าแรก</p>
    <p className={`${styles.description} ${styles.translation}`} lang="en">We couldn’t load the website. Please try again or return home.</p>
    <div className={styles.actions}><button className="button" type="button" onClick={retry}><RotateCcw size={20} aria-hidden="true" />ลองอีกครั้ง · Try again</button></div>
    <nav className={styles.languageLinks} aria-label="กลับหน้าแรก · Return home"><a href="/">หน้าแรกภาษาไทย</a><a href="/en" lang="en">English home</a></nav>
  </div>
  </main></body></html>;
}

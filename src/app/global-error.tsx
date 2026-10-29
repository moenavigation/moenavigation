'use client';
// Recovering a failed root layout needs a fresh document load.

import './globals.css';
import { LifeBuoy, RotateCcw } from 'lucide-react';
import { href } from '@/lib/content';
import styles from '@/components/RecoveryPage.module.css';

export default function GlobalError({ retry }: { retry: () => void }) {
  return <html lang="en"><head><title>MOE Navigation · Please try again</title><meta name="robots" content="noindex" /></head><body className={styles.globalBody}><main className={`container section ${styles.screen} ${styles.globalScreen}`}><div className={styles.card}>
    <div className={styles.badge}><LifeBuoy aria-hidden="true" /></div>
    <span className="eyebrow">MOE Navigation</span>
    <h1>We couldn’t load the website</h1>
    <p className={styles.description}>Please try again or return home.</p>
    <p className={`${styles.description} ${styles.translation}`} lang="th">ไม่สามารถโหลดเว็บไซต์ได้ โปรดลองอีกครั้ง หรือกลับไปยังหน้าแรก</p>
    <div className={styles.actions}><button className="button" type="button" onClick={retry}><RotateCcw size={20} aria-hidden="true" />Try again · ลองอีกครั้ง</button></div>
    <nav className={styles.languageLinks} aria-label="Return home · กลับหน้าแรก"><a href={href('en')} lang="en">English home</a><a href={href('th')} lang="th">หน้าแรกภาษาไทย</a></nav>
  </div>
  </main></body></html>;
}

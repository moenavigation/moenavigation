'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { Locale } from '@/lib/content';
import styles from './WorkingPanel.module.css';

export type WorkingPanelProps = {
  active: boolean;
  title?: string;
  description?: string;
  locale?: Locale;
  className?: string;
  delay?: number;
  floating?: boolean;
};

function PendingPanel({ title, description, locale = 'en', className = '', delay = 350, floating = false }: Omit<WorkingPanelProps, 'active'>) {
  const [stage, setStage] = useState<'waiting' | 'working' | 'extended'>('waiting');
  const thai = locale === 'th';
  useEffect(() => {
    const wait = Number.isFinite(delay) ? Math.max(0, delay) : 350;
    const show = window.setTimeout(() => setStage('working'), wait);
    const extended = window.setTimeout(() => setStage('extended'), Math.max(10_000, wait));
    return () => { window.clearTimeout(show); window.clearTimeout(extended); };
  }, [delay]);

  if (stage === 'waiting') return null;
  return <div className={`${styles.panel} ${floating ? styles.floating : ''} ${className}`} data-working-panel data-working-state={stage} role="status" aria-live="polite" aria-atomic="true" lang={locale}>
    <span className={styles.icon} aria-hidden="true"><LoaderCircle size={23} /></span>
    <div className={styles.copy}>
      <p className={styles.title}>{title || (thai ? 'กำลังดำเนินการ…' : 'Working…')}</p>
      <p className={styles.description}>{description || (thai ? 'โปรดรอสักครู่ระหว่างดำเนินการขั้นตอนนี้' : 'Please wait while we finish this step.')}</p>
      {stage === 'extended' && <p className={styles.extended}>{thai ? 'ยังอยู่ระหว่างดำเนินการ ขั้นตอนนี้อาจใช้เวลานานกว่าปกติเล็กน้อย' : 'Still working. This step is taking a little longer.'}</p>}
    </div>
  </div>;
}

/** Mount each pending run separately so completion clears its timers immediately. */
export default function WorkingPanel({ active, ...props }: WorkingPanelProps) {
  return active ? <PendingPanel {...props} /> : null;
}

'use client';

import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsLanguageSwitch.module.css';

export default function CmsLanguageSwitch({ compact = false, header = false }: { compact?: boolean; header?: boolean }) {
  const { locale, setLocale, t } = useCmsLocale();
  if (header) {
    const nextLocale = locale === 'th' ? 'en' : 'th';
    const switchLabel = t(nextLocale === 'en' ? 'Switch to English' : 'Switch to Thai');
    return <button className={styles.headerSwitch} type="button" lang={locale} aria-label={switchLabel} title={switchLabel} onClick={() => setLocale(nextLocale)} data-cms-language-switch>{locale === 'th' ? 'TH' : 'EN'}</button>;
  }
  return <div className={`${styles.switch} ${compact ? styles.compact : ''}`} role="group" aria-label={t('CMS language')} data-cms-language-switch>
    <button type="button" lang="th" aria-pressed={locale === 'th'} onClick={() => setLocale('th')}>ไทย</button>
    <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button>
  </div>;
}

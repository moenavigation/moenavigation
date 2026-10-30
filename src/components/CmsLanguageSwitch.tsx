'use client';

import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsLanguageSwitch.module.css';

export default function CmsLanguageSwitch() {
  const { locale, setLocale, t } = useCmsLocale();
  const nextLocale = locale === 'th' ? 'en' : 'th';
  const switchLabel = t(nextLocale === 'en' ? 'Switch to English' : 'Switch to Thai');
  return <button className={styles.headerSwitch} type="button" lang={locale} aria-label={switchLabel} title={switchLabel} onClick={() => setLocale(nextLocale)} data-cms-language-switch>{locale === 'th' ? 'TH' : 'EN'}</button>;
}

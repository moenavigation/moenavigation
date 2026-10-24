'use client';

import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsLanguageSwitch.module.css';

export default function CmsLanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useCmsLocale();
  return <div className={`${styles.switch} ${compact ? styles.compact : ''}`} role="group" aria-label={t('CMS language')} data-cms-language-switch>
    <button type="button" lang="th" aria-pressed={locale === 'th'} onClick={() => setLocale('th')}>ไทย</button>
    <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button>
  </div>;
}

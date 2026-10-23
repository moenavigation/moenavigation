import BrandMark from './BrandMark';
import type { Locale } from '@/lib/content';
import styles from './LoadingScreen.module.css';

type LoadingScreenProps = {
  variant?: 'public' | 'cms';
  locale?: Locale;
  stage?: 'session' | 'workspace' | 'page';
};

function NavigationEmblem() {
  return <div className={styles.emblem} aria-hidden="true">
    <svg className={styles.chart} viewBox="0 0 240 240" fill="none">
      <circle cx="120" cy="120" r="111" />
      <circle cx="120" cy="120" r="85" strokeDasharray="2 9" />
      <path d="M120 0v17m0 206v17M0 120h17m206 0h17M35 35l12 12m146 146 12 12M35 205l12-12M193 47l12-12" />
    </svg>
    <svg className={styles.orbit} viewBox="0 0 240 240" fill="none">
      <path d="M120 9a111 111 0 0 1 111 111" />
      <circle cx="231" cy="120" r="4" />
    </svg>
    <span className={styles.mark}><BrandMark /></span>
  </div>;
}

export default function LoadingScreen({ variant = 'public', locale = 'en', stage = 'page' }: LoadingScreenProps) {
  const thai = locale === 'th';
  const title = variant === 'cms'
    ? stage === 'session' ? 'Opening your workspace' : 'Getting your workspace ready'
    : thai ? 'รอสักครู่' : 'A moment, please';
  const description = variant === 'cms'
    ? stage === 'session' ? 'Checking your sign-in securely.' : 'Loading your content, images and website details.'
    : thai ? 'กำลังเตรียมเนื้อหาสำหรับคุณ' : 'We’re getting your page ready.';
  const status = variant === 'cms'
    ? stage === 'session' ? 'Checking your session' : 'Loading workspace'
    : thai ? 'กำลังโหลดหน้าเว็บไซต์' : 'Loading page';

  return <section className={`${styles.screen} ${variant === 'cms' ? styles.cms : styles.public}`} data-loading-screen={variant} lang={variant === 'cms' ? 'en' : locale}>
    <div className={styles.header} data-loading-header>
      <div className={styles.brand}><span><BrandMark /></span><strong>MOE <span>NAVIGATION</span></strong></div>
      <span className={styles.context}>{variant === 'cms' ? 'Content management' : thai ? 'บริการทางทะเล' : 'Maritime services'}</span>
    </div>
    <div className={styles.center}>
      <NavigationEmblem />
      <div className={styles.copy} role="status" aria-live="polite" aria-atomic="true">
        <span className={styles.status}><span aria-hidden="true" />{status}</span>
        <p className={styles.title}>{title}</p>
        <p>{description}</p>
      </div>
      <div className={styles.track} aria-hidden="true"><span /></div>
    </div>
    <div className={styles.horizon} aria-hidden="true"><span /><span /><span /></div>
  </section>;
}

export function LoadingPanel({ title, description, kind = 'content' }: { title: string; description?: string; kind?: 'content' | 'inbox' | 'media' }) {
  return <div className={styles.panel} data-loading-panel={kind}>
    <div className={styles.panelHeading} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.panelMark} aria-hidden="true"><BrandMark /></span>
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
    </div>
    <div className={`${styles.skeleton} ${kind === 'media' ? styles.mediaGrid : styles.rows}`} aria-hidden="true">
      {[0, 1, 2].map(index => <div className={styles.placeholder} key={index}><span className={styles.thumbnail} /><div><span /><span /></div></div>)}
    </div>
  </div>;
}

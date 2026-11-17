import { ArrowUpRight, Boxes, Route, Ship, Users } from 'lucide-react';
import type { ContentRecord } from '@/lib/cms-types';
import { href, local, type Locale } from '@/lib/content';
import { contentText } from '@/lib/public-content';
import { visibleFooterStatistics } from '@/lib/footer-statistics';
import Link from './NavigationLink';
import styles from './FooterStatistics.module.css';

const icons = [Ship, Boxes, Users, Route];

export default function FooterStatistics({ record, locale, fleetCount }: { record?: ContentRecord; locale: Locale; fleetCount: number }) {
  const items = visibleFooterStatistics(record, fleetCount);
  if (!items.length) return null;
  return <section className={styles.statistics} aria-label={local(locale, 'Company at a glance', 'ข้อมูลบริษัทโดยสรุป')}>
    <div className={styles.heading}>
      <h2>{contentText(record, 'caption', locale) || local(locale, 'At a glance', 'ข้อมูลโดยสรุป')}</h2>
      <Link href={href(locale, 'fleet')}>{local(locale, 'Explore our fleet', 'ดูกองเรือของเรา')}<ArrowUpRight size={18} aria-hidden="true" /></Link>
    </div>
    <dl className={styles.figures}>
      {items.map(item => {
        const sourceIndex = item.sourceIndex;
        const Icon = icons[sourceIndex] || Ship;
        return <div className={styles.figure} key={`${sourceIndex}-${item.label}`}>
          <Icon className={styles.icon} aria-hidden="true" />
          <div><dt>{local(locale, item.label, item.labelTh)}</dt><dd>{item.value}</dd></div>
        </div>;
      })}
    </dl>
  </section>;
}
